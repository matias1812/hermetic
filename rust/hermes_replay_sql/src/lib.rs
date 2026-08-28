use hermes_ffi_core::errors::ReplayError;
use hermes_ffi_core::replay::model::{ClaimToken, SignatureHash};
use hermes_ffi_core::replay::store::ReplayStore;
use mysql::prelude::Queryable;
use mysql::{Pool, params};
use rand::{RngExt, rng};

pub struct SqlReplayStore {
    pool: Pool,
}

impl SqlReplayStore {
    pub fn new(url: &str) -> Result<Self, mysql::Error> {
        let pool = Pool::new(url)?;
        Ok(Self { pool })
    }

    pub fn health_check(&self) -> Result<(), ReplayError> {
        let mut conn = self
            .pool
            .get_conn()
            .map_err(|e| ReplayError::StorageError(format!("Connection failed: {}", e)))?;

        // 1. Connection check
        conn.query_drop("SELECT 1")
            .map_err(|e| ReplayError::StorageError(format!("Ping failed: {}", e)))?;

        // 2. Schema version check
        let version: Option<i32> = conn
            .exec_first(
                "SELECT version FROM hermes_schema_version WHERE component = 'replay_registry'",
                (),
            )
            .map_err(|e| ReplayError::StorageError(format!("Version query failed: {}", e)))?;

        match version {
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
        conn.query_drop("SELECT replay_domain, signature_hash, state, claim_token, registered_at, expires_at FROM replay_claims LIMIT 1")
            .map_err(|e| ReplayError::StorageError(format!("Schema validation failed: {}", e)))?;

        Ok(())
    }

    fn generate_token() -> ClaimToken {
        let mut token = [0u8; 16];
        rng().fill(&mut token);
        token
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
            .get_conn()
            .map_err(|e| ReplayError::StorageError(e.to_string()))?;

        // 1. Prune expired opportunistically
        let _ = conn.exec_drop(
            "DELETE FROM replay_claims WHERE expires_at < :now",
            params! { "now" => now },
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
            ) VALUES (:domain, :hash, 'pending', :token, :now, :expires)
        "#;

        let result = conn.exec_drop(
            query,
            params! {
                "domain" => domain,
                "hash" => signature_hash,
                "token" => token,
                "now" => now,
                "expires" => expires_at,
            },
        );

        match result {
            Ok(_) => Ok(token),
            Err(mysql::Error::MySqlError(e)) if e.code == 1062 => {
                // ER_DUP_ENTRY (1062) means the hash is already in the database for this domain.
                // NOTE: The only UNIQUE constraint on this table must be PRIMARY KEY(replay_domain, signature_hash).
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
            .get_conn()
            .map_err(|e| ReplayError::StorageError(e.to_string()))?;

        let expires_at = now + ttl_seconds;

        let query = r#"
            UPDATE replay_claims
            SET
                state = 'consumed',
                claim_token = NULL,
                expires_at = :expires
            WHERE
                replay_domain = :domain
                AND signature_hash = :hash
                AND state = 'pending'
                AND claim_token = :token
        "#;

        conn.exec_drop(
            query,
            params! {
                "domain" => domain,
                "expires" => expires_at,
                "hash" => signature_hash,
                "token" => token,
            },
        )
        .map_err(|e| ReplayError::StorageError(e.to_string()))?;

        if conn.affected_rows() == 1 {
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
            .get_conn()
            .map_err(|e| ReplayError::StorageError(e.to_string()))?;

        let expires_at = now + ttl_seconds;

        let query = r#"
            UPDATE replay_claims
            SET
                state = 'rejected',
                claim_token = NULL,
                expires_at = :expires
            WHERE
                replay_domain = :domain
                AND signature_hash = :hash
                AND state = 'pending'
                AND claim_token = :token
        "#;

        conn.exec_drop(
            query,
            params! {
                "domain" => domain,
                "expires" => expires_at,
                "hash" => signature_hash,
                "token" => token,
            },
        )
        .map_err(|e| ReplayError::StorageError(e.to_string()))?;

        if conn.affected_rows() == 1 {
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
            .get_conn()
            .map_err(|e| ReplayError::StorageError(e.to_string()))?;

        let query = r#"
            DELETE FROM replay_claims
            WHERE
                replay_domain = :domain
                AND signature_hash = :hash
                AND state = 'pending'
                AND claim_token = :token
        "#;

        conn.exec_drop(
            query,
            params! {
                "domain" => domain,
                "hash" => signature_hash,
                "token" => token,
            },
        )
        .map_err(|e| ReplayError::StorageError(e.to_string()))?;

        if conn.affected_rows() == 1 {
            Ok(())
        } else {
            Err(ReplayError::InvalidTransition)
        }
    }
}

// Tests de integración contra un MySQL real -- este crate nunca tuvo tests propios (ver
// BACKLOG.md, sección "Baja prioridad"), la única verificación era una corrida manual
// puntual en Docker. Requieren TEST_DATABASE_URL apuntando a un MySQL real con el esquema de
// schema.sql ya aplicado; si la variable no está seteada, cada test se salta con un mensaje
// en vez de fallar -- así `cargo test` sigue siendo rápido y hermético en una máquina sin
// MySQL, y CI (que sí levanta un servicio MySQL, ver .github/workflows/rust_ffi.yml) ejercita
// el camino real. Mismos escenarios que hermes_ffi_core/src/replay/mod.rs (InMemoryReplayStore)
// para que ambos backends del trait ReplayStore queden probados con la misma cobertura.
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
    /// corridas -- a diferencia del store en memoria, MySQL persiste entre ejecuciones).
    fn setup(domain: &str) -> Option<SqlReplayStore> {
        let url = test_db_url()?;
        let store = SqlReplayStore::new(&url).expect("connect to TEST_DATABASE_URL");
        let mut conn = store.pool.get_conn().expect("get_conn");
        conn.exec_drop(
            "DELETE FROM replay_claims WHERE replay_domain = :domain",
            params! { "domain" => domain },
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

    macro_rules! require_mysql {
        ($store:expr) => {
            match $store {
                Some(s) => s,
                None => {
                    eprintln!(
                        "SKIPPED: set TEST_DATABASE_URL to a MySQL instance with schema.sql applied to run this test"
                    );
                    return;
                }
            }
        };
    }

    #[test]
    fn test_claim_commit_flow() {
        let store = require_mysql!(setup("sql_test_ccf"));
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
        let store = require_mysql!(setup("sql_test_reject"));
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
        let store = require_mysql!(setup("sql_test_release"));
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
        let store = require_mysql!(setup("sql_test_invalid_token"));
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
        let store = require_mysql!(setup("sql_test_health"));
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
                    "SKIPPED: set TEST_DATABASE_URL to a MySQL instance with schema.sql applied to run this test"
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
        // concurrentes es la restricción UNIQUE de MySQL (PRIMARY KEY(replay_domain,
        // signature_hash)) atrapada como error 1062 -- exactamente el camino de claim() que
        // traduce ese código a AlreadyClaimed.
        assert_eq!(successes, 1);
        assert_eq!(errors, 19);
    }
}
