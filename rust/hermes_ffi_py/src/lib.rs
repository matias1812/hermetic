use pyo3::prelude::*;
use pyo3::exceptions::{PyValueError, PyRuntimeError, PyPermissionError};
use hermes_ffi_core::replay::store::ReplayStore;
use hermes_ffi_core::replay::memory::InMemoryReplayStore;
use hermes_replay_sql::SqlReplayStore;
use sha3::{Sha3_256, Digest};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_SIGNATURE_BYTES: usize = 64 * 1024; // 64 KB limit

fn hash_signature(signature_bytes: &[u8]) -> [u8; 32] {
    let mut hasher = Sha3_256::new();
    hasher.update(signature_bytes);
    hasher.finalize().into()
}

fn map_replay_error(e: hermes_ffi_core::errors::ReplayError) -> PyErr {
    use hermes_ffi_core::errors::ReplayError::*;
    match e {
        AlreadyClaimed => PyPermissionError::new_err("Replay attack detected (already claimed)"),
        InvalidToken => PyValueError::new_err("Invalid claim token"),
        InvalidTransition => PyValueError::new_err("Invalid state transition"),
        NotFound => PyValueError::new_err("Claim not found or expired"),
        StorageError(msg) => PyRuntimeError::new_err(format!("Storage error: {}", msg)),
    }
}

fn system_now() -> PyResult<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .map_err(|_| PyRuntimeError::new_err("Clock error: SystemTime is before UNIX_EPOCH"))
}

fn validate_signature(signature_bytes: &[u8]) -> PyResult<()> {
    if signature_bytes.is_empty() || signature_bytes.len() > MAX_SIGNATURE_BYTES {
        return Err(PyValueError::new_err("Invalid signature length"));
    }
    Ok(())
}

fn validate_domain(domain: &str) -> PyResult<()> {
    if domain.is_empty() || domain.len() > 32 {
        return Err(PyValueError::new_err("Domain must be between 1 and 32 characters"));
    }
    Ok(())
}

/// InMemory Replay Registry (development only).
#[pyclass]
pub struct NativeReplayRegistry {
    store: Arc<InMemoryReplayStore>,
}

#[pymethods]
impl NativeReplayRegistry {
    #[new]
    pub fn new() -> Self {
        Self {
            store: Arc::new(InMemoryReplayStore::new()),
        }
    }

    #[pyo3(signature = (domain, signature_bytes, ttl_seconds))]
    pub fn claim(&self, py: Python, domain: &str, signature_bytes: &[u8], ttl_seconds: u64) -> PyResult<Vec<u8>> {
        validate_signature(signature_bytes)?;
        validate_domain(domain)?;
        let now = system_now()?;
        let hash = hash_signature(signature_bytes);
        let store = self.store.clone();
        
        // Clone domain string to move into the closure
        let domain_owned = domain.to_string();
        let token = py.detach(move || {
            store.claim(&domain_owned, hash, now, ttl_seconds)
        }).map_err(map_replay_error)?;
        
        Ok(token.to_vec())
    }

    #[cfg(feature = "test-clock")]
    #[pyo3(signature = (domain, signature_bytes, ttl_seconds, now))]
    pub fn claim_test(&self, py: Python, domain: &str, signature_bytes: &[u8], ttl_seconds: u64, now: u64) -> PyResult<Vec<u8>> {
        validate_signature(signature_bytes)?;
        validate_domain(domain)?;
        let hash = hash_signature(signature_bytes);
        let store = self.store.clone();
        
        let domain_owned = domain.to_string();
        let token = py.detach(move || {
            store.claim(&domain_owned, hash, now, ttl_seconds)
        }).map_err(map_replay_error)?;
        
        Ok(token.to_vec())
    }

    #[pyo3(signature = (domain, signature_bytes, token, ttl_seconds))]
    pub fn commit(&self, py: Python, domain: &str, signature_bytes: &[u8], token: &[u8], ttl_seconds: u64) -> PyResult<()> {
        validate_signature(signature_bytes)?;
        validate_domain(domain)?;
        let now = system_now()?;
        let hash = hash_signature(signature_bytes);
        let mut t = [0u8; 16];
        if token.len() != 16 {
            return Err(PyValueError::new_err("Token must be 16 bytes"));
        }
        t.copy_from_slice(token);

        let store = self.store.clone();
        let domain_owned = domain.to_string();
        py.detach(move || {
            store.commit(&domain_owned, hash, t, now, ttl_seconds)
        }).map_err(map_replay_error)?;
        Ok(())
    }

    #[cfg(feature = "test-clock")]
    #[pyo3(signature = (domain, signature_bytes, token, ttl_seconds, now))]
    pub fn commit_test(&self, py: Python, domain: &str, signature_bytes: &[u8], token: &[u8], ttl_seconds: u64, now: u64) -> PyResult<()> {
        validate_signature(signature_bytes)?;
        validate_domain(domain)?;
        let hash = hash_signature(signature_bytes);
        let mut t = [0u8; 16];
        if token.len() != 16 {
            return Err(PyValueError::new_err("Token must be 16 bytes"));
        }
        t.copy_from_slice(token);

        let store = self.store.clone();
        let domain_owned = domain.to_string();
        py.detach(move || {
            store.commit(&domain_owned, hash, t, now, ttl_seconds)
        }).map_err(map_replay_error)?;
        Ok(())
    }

    #[pyo3(signature = (domain, signature_bytes, token, ttl_seconds))]
    pub fn reject(&self, py: Python, domain: &str, signature_bytes: &[u8], token: &[u8], ttl_seconds: u64) -> PyResult<()> {
        validate_signature(signature_bytes)?;
        validate_domain(domain)?;
        let now = system_now()?;
        let hash = hash_signature(signature_bytes);
        let mut t = [0u8; 16];
        if token.len() != 16 {
            return Err(PyValueError::new_err("Token must be 16 bytes"));
        }
        t.copy_from_slice(token);

        let store = self.store.clone();
        let domain_owned = domain.to_string();
        py.detach(move || {
            store.reject(&domain_owned, hash, t, now, ttl_seconds)
        }).map_err(map_replay_error)?;
        Ok(())
    }

    #[cfg(feature = "test-clock")]
    #[pyo3(signature = (domain, signature_bytes, token, ttl_seconds, now))]
    pub fn reject_test(&self, py: Python, domain: &str, signature_bytes: &[u8], token: &[u8], ttl_seconds: u64, now: u64) -> PyResult<()> {
        validate_signature(signature_bytes)?;
        validate_domain(domain)?;
        let hash = hash_signature(signature_bytes);
        let mut t = [0u8; 16];
        if token.len() != 16 {
            return Err(PyValueError::new_err("Token must be 16 bytes"));
        }
        t.copy_from_slice(token);

        let store = self.store.clone();
        let domain_owned = domain.to_string();
        py.detach(move || {
            store.reject(&domain_owned, hash, t, now, ttl_seconds)
        }).map_err(map_replay_error)?;
        Ok(())
    }

    #[pyo3(signature = (domain, signature_bytes, token))]
    pub fn release(&self, py: Python, domain: &str, signature_bytes: &[u8], token: &[u8]) -> PyResult<()> {
        validate_signature(signature_bytes)?;
        validate_domain(domain)?;
        let hash = hash_signature(signature_bytes);
        let mut t = [0u8; 16];
        if token.len() != 16 {
            return Err(PyValueError::new_err("Token must be 16 bytes"));
        }
        t.copy_from_slice(token);

        let store = self.store.clone();
        let domain_owned = domain.to_string();
        py.detach(move || {
            store.release(&domain_owned, hash, t)
        }).map_err(map_replay_error)?;
        Ok(())
    }
}

/// SQL Shared Replay Registry (Production).
#[pyclass]
pub struct SqlReplayRegistry {
    store: Arc<SqlReplayStore>,
}

#[pymethods]
impl SqlReplayRegistry {
    #[new]
    pub fn new(url: &str) -> PyResult<Self> {
        let store = SqlReplayStore::new(url)
            .map_err(|e| PyRuntimeError::new_err(format!("Failed to connect to MySQL: {}", e)))?;
        Ok(Self {
            store: Arc::new(store),
        })
    }

    pub fn health_check(&self) -> PyResult<()> {
        self.store.health_check().map_err(|e| PyRuntimeError::new_err(format!("Health check failed: {}", e)))
    }

    #[pyo3(signature = (domain, signature_bytes, ttl_seconds))]
    pub fn claim(&self, py: Python, domain: &str, signature_bytes: &[u8], ttl_seconds: u64) -> PyResult<Vec<u8>> {
        validate_signature(signature_bytes)?;
        validate_domain(domain)?;
        let now = system_now()?;
        let hash = hash_signature(signature_bytes);
        let store = self.store.clone();
        
        let domain_owned = domain.to_string();
        let token = py.detach(move || {
            store.claim(&domain_owned, hash, now, ttl_seconds)
        }).map_err(map_replay_error)?;
        
        Ok(token.to_vec())
    }

    #[cfg(feature = "test-clock")]
    #[pyo3(signature = (domain, signature_bytes, ttl_seconds, now))]
    pub fn claim_test(&self, py: Python, domain: &str, signature_bytes: &[u8], ttl_seconds: u64, now: u64) -> PyResult<Vec<u8>> {
        validate_signature(signature_bytes)?;
        validate_domain(domain)?;
        let hash = hash_signature(signature_bytes);
        let store = self.store.clone();
        
        let domain_owned = domain.to_string();
        let token = py.detach(move || {
            store.claim(&domain_owned, hash, now, ttl_seconds)
        }).map_err(map_replay_error)?;
        
        Ok(token.to_vec())
    }

    #[pyo3(signature = (domain, signature_bytes, token, ttl_seconds))]
    pub fn commit(&self, py: Python, domain: &str, signature_bytes: &[u8], token: &[u8], ttl_seconds: u64) -> PyResult<()> {
        validate_signature(signature_bytes)?;
        validate_domain(domain)?;
        let now = system_now()?;
        let hash = hash_signature(signature_bytes);
        let mut t = [0u8; 16];
        if token.len() != 16 {
            return Err(PyValueError::new_err("Token must be 16 bytes"));
        }
        t.copy_from_slice(token);

        let store = self.store.clone();
        let domain_owned = domain.to_string();
        py.detach(move || {
            store.commit(&domain_owned, hash, t, now, ttl_seconds)
        }).map_err(map_replay_error)?;
        Ok(())
    }

    #[cfg(feature = "test-clock")]
    #[pyo3(signature = (domain, signature_bytes, token, ttl_seconds, now))]
    pub fn commit_test(&self, py: Python, domain: &str, signature_bytes: &[u8], token: &[u8], ttl_seconds: u64, now: u64) -> PyResult<()> {
        validate_signature(signature_bytes)?;
        validate_domain(domain)?;
        let hash = hash_signature(signature_bytes);
        let mut t = [0u8; 16];
        if token.len() != 16 {
            return Err(PyValueError::new_err("Token must be 16 bytes"));
        }
        t.copy_from_slice(token);

        let store = self.store.clone();
        let domain_owned = domain.to_string();
        py.detach(move || {
            store.commit(&domain_owned, hash, t, now, ttl_seconds)
        }).map_err(map_replay_error)?;
        Ok(())
    }

    #[pyo3(signature = (domain, signature_bytes, token, ttl_seconds))]
    pub fn reject(&self, py: Python, domain: &str, signature_bytes: &[u8], token: &[u8], ttl_seconds: u64) -> PyResult<()> {
        validate_signature(signature_bytes)?;
        validate_domain(domain)?;
        let now = system_now()?;
        let hash = hash_signature(signature_bytes);
        let mut t = [0u8; 16];
        if token.len() != 16 {
            return Err(PyValueError::new_err("Token must be 16 bytes"));
        }
        t.copy_from_slice(token);

        let store = self.store.clone();
        let domain_owned = domain.to_string();
        py.detach(move || {
            store.reject(&domain_owned, hash, t, now, ttl_seconds)
        }).map_err(map_replay_error)?;
        Ok(())
    }

    #[cfg(feature = "test-clock")]
    #[pyo3(signature = (domain, signature_bytes, token, ttl_seconds, now))]
    pub fn reject_test(&self, py: Python, domain: &str, signature_bytes: &[u8], token: &[u8], ttl_seconds: u64, now: u64) -> PyResult<()> {
        validate_signature(signature_bytes)?;
        validate_domain(domain)?;
        let hash = hash_signature(signature_bytes);
        let mut t = [0u8; 16];
        if token.len() != 16 {
            return Err(PyValueError::new_err("Token must be 16 bytes"));
        }
        t.copy_from_slice(token);

        let store = self.store.clone();
        let domain_owned = domain.to_string();
        py.detach(move || {
            store.reject(&domain_owned, hash, t, now, ttl_seconds)
        }).map_err(map_replay_error)?;
        Ok(())
    }

    #[pyo3(signature = (domain, signature_bytes, token))]
    pub fn release(&self, py: Python, domain: &str, signature_bytes: &[u8], token: &[u8]) -> PyResult<()> {
        validate_signature(signature_bytes)?;
        validate_domain(domain)?;
        let hash = hash_signature(signature_bytes);
        let mut t = [0u8; 16];
        if token.len() != 16 {
            return Err(PyValueError::new_err("Token must be 16 bytes"));
        }
        t.copy_from_slice(token);

        let store = self.store.clone();
        let domain_owned = domain.to_string();
        py.detach(move || {
            store.release(&domain_owned, hash, t)
        }).map_err(map_replay_error)?;
        Ok(())
    }
}

#[pymodule]
fn hermes_ffi(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<NativeReplayRegistry>()?;
    m.add_class::<SqlReplayRegistry>()?;
    Ok(())
}
