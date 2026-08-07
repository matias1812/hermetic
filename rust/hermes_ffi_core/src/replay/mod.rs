pub mod model;
pub mod store;
pub mod memory;

#[cfg(test)]
mod tests {
    use super::memory::InMemoryReplayStore;
    use super::store::ReplayStore;
    use crate::errors::ReplayError;

    use std::sync::Arc;
    use std::thread;

    #[test]
    fn test_claim_commit_flow() {
        let store = InMemoryReplayStore::new();
        let hash = [1u8; 32];
        let now = 1000;

        let token = store.claim(hash, now).unwrap();
        // Trying to claim again should fail
        assert_eq!(store.claim(hash, now).unwrap_err(), ReplayError::AlreadyClaimed);

        store.commit(hash, token, now + 10).unwrap();

        // Already consumed, claiming again fails
        assert_eq!(store.claim(hash, now + 20).unwrap_err(), ReplayError::AlreadyClaimed);

        // Committing again fails
        assert_eq!(store.commit(hash, token, now + 20).unwrap_err(), ReplayError::InvalidTransition);
    }

    #[test]
    fn test_reject_flow() {
        let store = InMemoryReplayStore::new();
        let hash = [2u8; 32];
        let now = 2000;

        let token = store.claim(hash, now).unwrap();
        store.reject(hash, token, now + 5).unwrap();

        assert_eq!(store.claim(hash, now + 10).unwrap_err(), ReplayError::AlreadyClaimed);
        assert_eq!(store.reject(hash, token, now + 10).unwrap_err(), ReplayError::InvalidTransition);
    }

    #[test]
    fn test_release_flow() {
        let store = InMemoryReplayStore::new();
        let hash = [3u8; 32];
        let now = 3000;

        let token = store.claim(hash, now).unwrap();
        store.release(hash, token).unwrap();

        // Should be able to claim again since it was released
        let new_token = store.claim(hash, now + 5).unwrap();
        assert_ne!(token, new_token);
    }

    #[test]
    fn test_invalid_token() {
        let store = InMemoryReplayStore::new();
        let hash = [4u8; 32];
        let now = 4000;

        let _token = store.claim(hash, now).unwrap();
        let invalid_token = [9u8; 16];

        assert_eq!(store.commit(hash, invalid_token, now).unwrap_err(), ReplayError::InvalidToken);
        assert_eq!(store.reject(hash, invalid_token, now).unwrap_err(), ReplayError::InvalidToken);
        assert_eq!(store.release(hash, invalid_token).unwrap_err(), ReplayError::InvalidToken);
    }

    #[test]
    fn test_ttl_expiration() {
        let store = InMemoryReplayStore::new();
        let hash = [5u8; 32];
        let now = 5000;

        let _token = store.claim(hash, now).unwrap();

        // Advance past TTL (300 seconds)
        let future = now + 301;
        
        // Old claim expired, new claim should succeed
        let new_token = store.claim(hash, future).unwrap();
        
        // Cannot commit old token because state was overwritten by the new claim
        let old_token = _token;
        assert_eq!(store.commit(hash, old_token, future).unwrap_err(), ReplayError::InvalidToken);
        
        store.commit(hash, new_token, future).unwrap();
    }

    #[test]
    fn test_aba_concurrency() {
        let store = Arc::new(InMemoryReplayStore::new());
        let hash = [6u8; 32];
        let now = 6000;

        let mut handles = vec![];
        for _ in 0..100 {
            let s = store.clone();
            handles.push(thread::spawn(move || {
                s.claim(hash, now)
            }));
        }

        let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
        let successes = results.iter().filter(|r| r.is_ok()).count();
        let errors = results.iter().filter(|r| matches!(r, Err(ReplayError::AlreadyClaimed))).count();

        assert_eq!(successes, 1);
        assert_eq!(errors, 99);
    }
}
