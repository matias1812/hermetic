use crate::errors::ReplayError;
use crate::replay::model::{ClaimToken, SignatureHash};

pub trait ReplayStore: Send + Sync {
    /// Attempts to claim a signature for processing.
    /// Returns a ClaimToken if successful (transitions to Pending).
    fn claim(
        &self,
        domain: &str,
        signature_hash: SignatureHash,
        now: u64,
        ttl_seconds: u64,
    ) -> Result<ClaimToken, ReplayError>;

    /// Commits a successful processing of a signature (transitions to Consumed).
    fn commit(
        &self,
        domain: &str,
        signature_hash: SignatureHash,
        token: ClaimToken,
        now: u64,
        ttl_seconds: u64,
    ) -> Result<(), ReplayError>;

    /// Rejects a signature as definitively invalid (transitions to Rejected).
    fn reject(
        &self,
        domain: &str,
        signature_hash: SignatureHash,
        token: ClaimToken,
        now: u64,
        ttl_seconds: u64,
    ) -> Result<(), ReplayError>;

    /// Releases a claim due to transient failure, allowing it to be claimed again (transitions to Missing).
    fn release(
        &self,
        domain: &str,
        signature_hash: SignatureHash,
        token: ClaimToken,
    ) -> Result<(), ReplayError>;
}
