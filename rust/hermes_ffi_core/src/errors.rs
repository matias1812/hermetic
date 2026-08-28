use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ReplayError {
    #[error("Replay attack detected: signature already claimed or processed.")]
    AlreadyClaimed,

    #[error("Invalid claim token provided.")]
    InvalidToken,

    #[error("Invalid state transition attempted from current state.")]
    InvalidTransition,

    #[error("State not found.")]
    NotFound,

    #[error("Internal storage error: {0}")]
    StorageError(String),
}
