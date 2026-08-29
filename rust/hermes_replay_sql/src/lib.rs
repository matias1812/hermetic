use hermes_ffi_core::errors::ReplayError;
use hermes_ffi_core::replay::model::{ClaimToken, SignatureHash};
use hermes_ffi_core::replay::store::ReplayStore;
use postgres::NoTls;
use postgres::error::SqlState;
use r2d2::Pool;
use r2d2_postgres::PostgresConnectionManager;
use rand::{RngExt, rng};

pub struct SqlReplayStore {
    pool: Pool<PostgresConnectionManager<NoTls>>,
}

impl SqlReplayStore {
    pub fn new(url: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let config: postgres::Config = url.parse()?;
        // NoTls: mismo nivel de simplicidad que el crate `mysql` anterior (tampoco
        // configuraba TLS explícito). Asume red interna/privada entre el backend y
        // Postgres (p.ej. Render: mismo servicio y base en la misma región, conectados
        // por la URL interna) -- si en algún momento la conexión cruza redes públicas
        // sin VPN/red privada, esto necesita postgres-native-tls o postgres-openssl.
        let manager = PostgresConnectionManager::new(config, NoTls);
        let pool = Pool::new(manager)?;
        Ok(Self { pool })
    }

    pub fn health_check(&self) -> Result<(), ReplayError> {
        let mut conn = self
            .pool
            .get()
            .map_err(|e| ReplayError::StorageError(format!("Connection failed: {}", e)))?;

        // 1. Connection check
        conn.execute("SELECT 1", &[])
            .map_err(|e| ReplayError::StorageError(format!("Ping failed: {}", e)))?;

        // 2. Schema version check
        let row = conn
            .query_opt(
                "SELECT version FROM hermes_schema_version WHERE component = 'replay_registry'",
                &[],
            )
            .map_err(|e| ReplayError::StorageError(format!("Version query failed: {}", e)))?;

        match row.map(|r| r.get::<_, i32>(0)) {
            Some(1) => {}
            Some(v) => {
                return Err(ReplayError::StorageError(format!(
                    "Incompatible schema version: {}",
                    v
                )));
            }
            None => return Err(ReplayError::StorageError("Schema version not found".into())),
        }

        // 3. Basic column existence
        conn.execute("SELECT replay_domain, signature_hash, state, claim_token, registered_at, expires_at FROM replay_claims LIMIT 1", &[])
            .map_err(|e| ReplayError::StorageError(format!("Schema validation failed: {}", e)))?;

        Ok(())
    }

    fn generate_token() -> ClaimToken {
        let mut token = [0u8; 16];
        rng().fill(&mut token);
        token
    }

    fn is_unique_violation(e: &postgres::Error) -> bool {
        e.code() == Some(&SqlState::UNIQUE_VIOLATION)
    }
}

impl ReplayStore for SqlReplayStore {
    fn claim(
        &self,
        domain: &str,
        signature_hash: SignatureHash,
        now: u64,
        ttl_seconds: u64,
    ) -> Result<ClaimToken, ReplayError> {
        let mut conn = self
            .pool
            .get()
            .map_err(|e| ReplayError::StorageError(e.to_string()))?;

        // 1. Prune expired opportunistically
        let _ = conn.execute(
            "DELETE FROM replay_claims WHERE expires_at < $1",
            &[&(now as i64)],
        );

        let token = Self::generate_token();
        let expires_at = now + ttl_seconds;

        // 2. Insert, catching duplicate key errors explicitly
        let query = r#"
            INSERT INTO replay_claims (
                replay_domain,
                signature_hash,
                state,
                claim_token,
                registered_at,
                expires_at
            ) VALUES ($1, $2, 'pending', $3, $4, $5)
        "#;

        let result = conn.execute(
            query,
            &[
                &domain,
                &&signature_hash[..],
                &&token[..],
                &(now as i64),
                &(expires_at as i64),
            ],
        );

        match result {
            Ok(_) => Ok(token),
            Err(e) if Self::is_unique_violation(&e) => {
                // El hash ya está en la base para este dominio.
                // NOTE: la única restricción UNIQUE de esta tabla debe ser
                // PRIMARY KEY(replay_domain, signature_hash).
                Err(ReplayError::AlreadyClaimed)
            }
            Err(e) => Err(ReplayError::StorageError(e.to_string())),
        }
    }

    fn commit(
        &self,
        domain: &str,
        signature_hash: SignatureHash,
        token: ClaimToken,
        now: u64,
        ttl_seconds: u64,
    ) -> Result<(), ReplayError> {
        let mut conn = self
            .pool
            .get()
            .map_err(|e| ReplayError::StorageError(e.to_string()))?;

        let expires_at = now + ttl_seconds;

        let query = r#"
            UPDATE replay_claims
            SET
                state = 'consumed',
                claim_token = NULL,
                expires_at = $1
            WHERE
                replay_domain = $2
                AND signature_hash = $3
                AND state = 'pending'
                AND claim_token = $4
        "#;

        let affected = conn
            .execute(
                query,
                &[
                    &(expires_at as i64),
                    &domain,
                    &&signature_hash[..],
                    &&token[..],
                ],
            )
            .map_err(|e| ReplayError::StorageError(e.to_string()))?;

        if affected == 1 {
            Ok(())
        } else {
            Err(ReplayError::InvalidTransition)
        }
    }

    fn reject(
        &self,
        domain: &str,
        signature_hash: SignatureHash,
        token: ClaimToken,
        now: u64,
        ttl_seconds: u64,
    ) -> Result<(), ReplayError> {
        let mut conn = self
            .pool
            .get()
            .map_err(|e| ReplayError::StorageError(e.to_string()))?;

        let expires_at = now + ttl_seconds;

        let query = r#"
            UPDATE replay_claims
            SET
                state = 'rejected',
                claim_token = NULL,
                expires_at = $1
            WHERE
                replay_domain = $2
                AND signature_hash = $3
                AND state = 'pending'
                AND claim_token = $4
        "#;

        let affected = conn
            .execute(
                query,
                &[
                    &(expires_at as i64),
                    &domain,
                    &&signature_hash[..],
                    &&token[..],
                ],
            )
            .map_err(|e| ReplayError::StorageError(e.to_string()))?;

        if affected == 1 {
            Ok(())
        } else {
            Err(ReplayError::InvalidTransition)
        }
    }

    fn release(
        &self,
        domain: &str,
        signature_hash: SignatureHash,
        token: ClaimToken,
    ) -> Result<(), ReplayError> {
        let mut conn = self
            .pool
            .get()
            .map_err(|e| ReplayError::StorageError(e.to_string()))?;

        let query = r#"
            DELETE FROM replay_claims
            WHERE
                replay_domain = $1
                AND signature_hash = $2
                AND state = 'pending'
                AND claim_token = $3
        "#;

        let affected = conn
            .execute(query, &[&domain, &&signature_hash[..], &&token[..]])
            .map_err(|e| ReplayError::StorageError(e.to_string()))?;

        if affected == 1 {
            Ok(())
        } else {
            Err(ReplayError::InvalidTransition)
        }
    }
}

// Tests de integración contra un Postgres real -- este crate nunca tuvo tests propios (ver
// BACKLOG.md, sección "Baja prioridad"), la única verificación era una corrida manual
// puntual en Docker. Requieren TEST_DATABASE_URL apuntando a un Postgres real con el
// esquema de schema.sql ya aplicado; si la variable no está seteada, cada test se salta
// con un mensaje en vez de fallar -- así `cargo test` sigue siendo rápido y hermético en
// una máquina sin Postgres, y CI (que sí levanta un servicio Postgres, ver
// .github/workflows/rust_ffi.yml) ejercita el camino real. Mismos escenarios que
// hermes_ffi_core/src/replay/mod.rs (InMemoryReplayStore) para que ambos backends del
// trait ReplayStore queden probados con la misma cobertura.
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::thread;
    use std::time::{SystemTime, UNIX_EPOCH};

    const TTL: u64 = 300;

    fn test_db_url() -> Option<String> {
        std::env::var("TEST_DATABASE_URL").ok()
    }

    /// Conecta y limpia cualquier fila vieja para el dominio del test (idempotente entre
    /// corridas -- a diferencia del store en memoria, Postgres persiste entre ejecuciones).
    fn setup(domain: &str) -> Option<SqlReplayStore> {
        let url = test_db_url()?;
        let store = SqlReplayStore::new(&url).expect("connect to TEST_DATABASE_URL");
        let mut conn = store.pool.get().expect("get connection");
        conn.execute(
            "DELETE FROM replay_claims WHERE replay_domain = $1",
            &[&domain],
        )
        .expect("cleanup previous test rows");
        Some(store)
    }

    fn now() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
    }

    macro_rules! require_postgres {
        ($store:expr) => {
            match $store {
                Some(s) => s,
                None => {
                    eprintln!(
                        "SKIPPED: set TEST_DATABASE_URL to a Postgres instance with schema.sql applied to run this test"
                    );
                    return;
                }
            }
        };
    }

    #[test]
    fn test_claim_commit_flow() {
        let store = require_postgres!(setup("sql_test_ccf"));
        let hash = [1u8; 32];
        let t = now();

        let token = store.claim("sql_test_ccf", hash, t, TTL).unwrap();
        assert_eq!(
            store.claim("sql_test_ccf", hash, t, TTL).unwrap_err(),
            ReplayError::AlreadyClaimed
        );

        store
            .commit("sql_test_ccf", hash, token, t + 10, TTL)
            .unwrap();

        // Ya consumido: un claim nuevo debe rechazarse (la fila sigue viva hasta expires_at)
        assert_eq!(
            store.claim("sql_test_ccf", hash, t + 20, TTL).unwrap_err(),
            ReplayError::AlreadyClaimed
        );
        // Commitear de nuevo falla: ya no está en estado 'pending'
        assert_eq!(
            store
                .commit("sql_test_ccf", hash, token, t + 20, TTL)
                .unwrap_err(),
            ReplayError::InvalidTransition
        );
    }

    #[test]
    fn test_reject_flow() {
        let store = require_postgres!(setup("sql_test_reject"));
        let hash = [2u8; 32];
        let t = now();

        let token = store.claim("sql_test_reject", hash, t, TTL).unwrap();
        store
            .reject("sql_test_reject", hash, token, t + 5, TTL)
            .unwrap();

        assert_eq!(
            store
                .claim("sql_test_reject", hash, t + 10, TTL)
                .unwrap_err(),
            ReplayError::AlreadyClaimed
        );
        assert_eq!(
            store
                .reject("sql_test_reject", hash, token, t + 10, TTL)
                .unwrap_err(),
            ReplayError::InvalidTransition
        );
    }

    #[test]
    fn test_release_flow() {
        let store = require_postgres!(setup("sql_test_release"));
        let hash = [3u8; 32];
        let t = now();

        let token = store.claim("sql_test_release", hash, t, TTL).unwrap();
        store.release("sql_test_release", hash, token).unwrap();

        // Al liberar, la fila se borra -- debe poder reclamarse de nuevo
        let new_token = store.claim("sql_test_release", hash, t + 5, TTL).unwrap();
        assert_ne!(token, new_token);
    }

    #[test]
    fn test_invalid_token() {
        let store = require_postgres!(setup("sql_test_invalid_token"));
        let hash = [4u8; 32];
        let t = now();

        let _token = store.claim("sql_test_invalid_token", hash, t, TTL).unwrap();
        let invalid_token = [9u8; 16];

        assert_eq!(
            store
                .commit("sql_test_invalid_token", hash, invalid_token, t, TTL)
                .unwrap_err(),
            ReplayError::InvalidTransition
        );
        assert_eq!(
            store
                .reject("sql_test_invalid_token", hash, invalid_token, t, TTL)
                .unwrap_err(),
            ReplayError::InvalidTransition
        );
        assert_eq!(
            store
                .release("sql_test_invalid_token", hash, invalid_token)
                .unwrap_err(),
            ReplayError::InvalidTransition
        );
    }

    #[test]
    fn test_health_check() {
        let store = require_postgres!(setup("sql_test_health"));
        store
            .health_check()
            .expect("health_check should pass against a properly migrated DB");
    }

    #[test]
    fn test_aba_concurrency() {
        let store = match setup("sql_test_aba") {
            Some(s) => Arc::new(s),
            None => {
                eprintln!(
                    "SKIPPED: set TEST_DATABASE_URL to a Postgres instance with schema.sql applied to run this test"
                );
                return;
            }
        };
        let hash = [6u8; 32];
        let t = now();

        let mut handles = vec![];
        for _ in 0..20 {
            let s = store.clone();
            handles.push(thread::spawn(move || s.claim("sql_test_aba", hash, t, TTL)));
        }

        let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
        let successes = results.iter().filter(|r| r.is_ok()).count();
        let errors = results
            .iter()
            .filter(|r| matches!(r, Err(ReplayError::AlreadyClaimed)))
            .count();

        // A diferencia del store en memoria (Mutex local), acá lo que serializa las claims
        // concurrentes es la restricción UNIQUE de Postgres (PRIMARY KEY(replay_domain,
        // signature_hash)) atrapada como SqlState::UNIQUE_VIOLATION -- exactamente el
        // camino de claim() que traduce ese código a AlreadyClaimed.
        assert_eq!(successes, 1);
        assert_eq!(errors, 19);
    }
}
