pub type ClaimToken = [u8; 16];
pub type SignatureHash = [u8; 32];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReplayState {
    Missing,
    Pending,
    Consumed,
    Rejected,
}
