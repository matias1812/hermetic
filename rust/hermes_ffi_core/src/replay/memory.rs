use rand::{RngExt, rng};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::errors::ReplayError;
use crate::replay::model::{ClaimToken, ReplayState, SignatureHash};
use crate::replay::store::ReplayStore;

const MAX_ENTRIES: usize = 100_000;

#[derive(Hash, Eq, PartialEq, Clone)]
struct Key {
    domain: String,
    hash: SignatureHash,
}

struct Entry {
    state: ReplayState,
    token: Option<ClaimToken>,
    expires_at: u64,
}

#[derive(Clone)]
pub struct InMemoryReplayStore {
    cache: Arc<Mutex<HashMap<Key, Entry>>>,
}

impl InMemoryReplayStore {
    pub fn new() -> Self {
        Self {
            cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn prune_expired(&self, map: &mut HashMap<Key, Entry>, now: u64) {
        if map.len() > MAX_ENTRIES {
            map.retain(|_, v| v.expires_at > now);
        }
    }

    fn generate_token() -> ClaimToken {
        let mut token = [0u8; 16];
        rng().fill(&mut token);
        token
    }
}

impl Default for InMemoryReplayStore {
    fn default() -> Self {
        Self::new()
    }
}

impl ReplayStore for InMemoryReplayStore {
    fn claim(
        &self,
        domain: &str,
        signature_hash: SignatureHash,
        now: u64,
        ttl_seconds: u64,
    ) -> Result<ClaimToken, ReplayError> {
        let mut map = self
            .cache
            .lock()
            .map_err(|_| ReplayError::StorageError("Mutex poisoned".into()))?;
        self.prune_expired(&mut map, now);

        if map.len() >= MAX_ENTRIES {
            // Force a prune even if we didn't hit it before
            map.retain(|_, v| v.expires_at > now);
            if map.len() >= MAX_ENTRIES {
                return Err(ReplayError::StorageError("Max capacity reached".into()));
            }
        }

        let key = Key {
            domain: domain.to_string(),
            hash: signature_hash,
        };

        if let Some(entry) = map.get(&key)
            && entry.expires_at > now
        {
            return Err(ReplayError::AlreadyClaimed);
        }

        let token = Self::generate_token();
        map.insert(
            key,
            Entry {
                state: ReplayState::Pending,
                token: Some(token),
                expires_at: now + ttl_seconds,
            },
        );

        Ok(token)
    }

    fn commit(
        &self,
        domain: &str,
        signature_hash: SignatureHash,
        token: ClaimToken,
        now: u64,
        ttl_seconds: u64,
    ) -> Result<(), ReplayError> {
        let mut map = self
            .cache
            .lock()
            .map_err(|_| ReplayError::StorageError("Mutex poisoned".into()))?;

        let key = Key {
            domain: domain.to_string(),
            hash: signature_hash,
        };

        let entry = map.get_mut(&key).ok_or(ReplayError::NotFound)?;
        if entry.expires_at <= now {
            return Err(ReplayError::NotFound); // Treat expired as Missing
        }
        if entry.state != ReplayState::Pending {
            return Err(ReplayError::InvalidTransition);
        }
        if entry.token != Some(token) {
            return Err(ReplayError::InvalidToken);
        }

        entry.state = ReplayState::Consumed;
        entry.token = None;
        entry.expires_at = now + ttl_seconds;
        Ok(())
    }

    fn reject(
        &self,
        domain: &str,
        signature_hash: SignatureHash,
        token: ClaimToken,
        now: u64,
        ttl_seconds: u64,
    ) -> Result<(), ReplayError> {
        let mut map = self
            .cache
            .lock()
            .map_err(|_| ReplayError::StorageError("Mutex poisoned".into()))?;

        let key = Key {
            domain: domain.to_string(),
            hash: signature_hash,
        };

        let entry = map.get_mut(&key).ok_or(ReplayError::NotFound)?;
        if entry.expires_at <= now {
            return Err(ReplayError::NotFound);
        }
        if entry.state != ReplayState::Pending {
            return Err(ReplayError::InvalidTransition);
        }
        if entry.token != Some(token) {
            return Err(ReplayError::InvalidToken);
        }

        entry.state = ReplayState::Rejected;
        entry.token = None;
        entry.expires_at = now + ttl_seconds;
        Ok(())
    }

    fn release(
        &self,
        domain: &str,
        signature_hash: SignatureHash,
        token: ClaimToken,
    ) -> Result<(), ReplayError> {
        let mut map = self
            .cache
            .lock()
            .map_err(|_| ReplayError::StorageError("Mutex poisoned".into()))?;

        let key = Key {
            domain: domain.to_string(),
            hash: signature_hash,
        };

        let entry = map.get(&key).ok_or(ReplayError::NotFound)?;
        // We do not check expiration for release because release is deleting it anyway, but we should verify the state.
        if entry.state != ReplayState::Pending {
            return Err(ReplayError::InvalidTransition);
        }
        if entry.token != Some(token) {
            return Err(ReplayError::InvalidToken);
        }

        map.remove(&key);
        Ok(())
    }
}
