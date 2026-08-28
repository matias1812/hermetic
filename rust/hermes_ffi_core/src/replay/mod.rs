pub mod memory;
pub mod model;
pub mod store;

#[cfg(test)]
mod tests {
    use super::memory::InMemoryReplayStore;
    use super::store::ReplayStore;
    use crate::errors::ReplayError;

    use std::sync::Arc;
    use std::thread;

    const TTL: u64 = 300;
    const DOMAIN: &str = "test_domain";

    #[test]
    fn test_claim_commit_flow() {
        let store = InMemoryReplayStore::new();
        let hash = [1u8; 32];
        let now = 1000;

        let token = store.claim(DOMAIN, hash, now, TTL).unwrap();
        // Trying to claim again should fail
        assert_eq!(
            store.claim(DOMAIN, hash, now, TTL).unwrap_err(),
            ReplayError::AlreadyClaimed
        );

        store.commit(DOMAIN, hash, token, now + 10, TTL).unwrap();

        // Already consumed, claiming again fails
        assert_eq!(
            store.claim(DOMAIN, hash, now + 20, TTL).unwrap_err(),
            ReplayError::AlreadyClaimed
        );

        // Committing again fails
        assert_eq!(
            store
                .commit(DOMAIN, hash, token, now + 20, TTL)
                .unwrap_err(),
            ReplayError::InvalidTransition
        );
    }

    #[test]
    fn test_reject_flow() {
        let store = InMemoryReplayStore::new();
        let hash = [2u8; 32];
        let now = 2000;

        let token = store.claim(DOMAIN, hash, now, TTL).unwrap();
        store.reject(DOMAIN, hash, token, now + 5, TTL).unwrap();

        assert_eq!(
            store.claim(DOMAIN, hash, now + 10, TTL).unwrap_err(),
            ReplayError::AlreadyClaimed
        );
        assert_eq!(
            store
                .reject(DOMAIN, hash, token, now + 10, TTL)
                .unwrap_err(),
            ReplayError::InvalidTransition
        );
    }

    #[test]
    fn test_release_flow() {
        let store = InMemoryReplayStore::new();
        let hash = [3u8; 32];
        let now = 3000;

        let token = store.claim(DOMAIN, hash, now, TTL).unwrap();
        store.release(DOMAIN, hash, token).unwrap();

        // Should be able to claim again since it was released
        let new_token = store.claim(DOMAIN, hash, now + 5, TTL).unwrap();
        assert_ne!(token, new_token);
    }

    #[test]
    fn test_invalid_token() {
        let store = InMemoryReplayStore::new();
        let hash = [4u8; 32];
        let now = 4000;

        let _token = store.claim(DOMAIN, hash, now, TTL).unwrap();
        let invalid_token = [9u8; 16];

        assert_eq!(
            store
                .commit(DOMAIN, hash, invalid_token, now, TTL)
                .unwrap_err(),
            ReplayError::InvalidToken
        );
        assert_eq!(
            store
                .reject(DOMAIN, hash, invalid_token, now, TTL)
                .unwrap_err(),
            ReplayError::InvalidToken
        );
        assert_eq!(
            store.release(DOMAIN, hash, invalid_token).unwrap_err(),
            ReplayError::InvalidToken
        );
    }

    #[test]
    fn test_ttl_expiration() {
        let store = InMemoryReplayStore::new();
        let hash = [5u8; 32];
        let now = 5000;

        let _token = store.claim(DOMAIN, hash, now, TTL).unwrap();

        // Advance past TTL (300 seconds)
        let future = now + TTL + 1;

        // Old claim expired, new claim should succeed
        let new_token = store.claim(DOMAIN, hash, future, TTL).unwrap();

        // Cannot commit old token because state was overwritten by the new claim
        let old_token = _token;
        assert_eq!(
            store
                .commit(DOMAIN, hash, old_token, future, TTL)
                .unwrap_err(),
            ReplayError::InvalidToken
        );

        store.commit(DOMAIN, hash, new_token, future, TTL).unwrap();
    }

    #[test]
    fn test_aba_concurrency() {
        let store = Arc::new(InMemoryReplayStore::new());
        let hash = [6u8; 32];
        let now = 6000;

        let mut handles = vec![];
        for _ in 0..100 {
            let s = store.clone();
            handles.push(thread::spawn(move || s.claim(DOMAIN, hash, now, TTL)));
        }

        let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
        let successes = results.iter().filter(|r| r.is_ok()).count();
        let errors = results
            .iter()
            .filter(|r| matches!(r, Err(ReplayError::AlreadyClaimed)))
            .count();

        assert_eq!(successes, 1);
        assert_eq!(errors, 99);
    }
}
