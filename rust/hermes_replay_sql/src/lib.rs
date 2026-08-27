use hermes_ffi_core::errors::ReplayError;
use hermes_ffi_core::replay::model::{ClaimToken, SignatureHash};
use hermes_ffi_core::replay::store::ReplayStore;
use mysql::prelude::Queryable;
use mysql::{params, Pool};
use rand::{rng, RngExt};

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
        let version: Option<i32> = conn.exec_first(
            "SELECT version FROM hermes_schema_version WHERE component = 'replay_registry'",
            (),
        ).map_err(|e| ReplayError::StorageError(format!("Version query failed: {}", e)))?;

        match version {
            Some(1) => {}
            Some(v) => return Err(ReplayError::StorageError(format!("Incompatible schema version: {}", v))),
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
