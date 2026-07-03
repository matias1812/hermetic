/// Constantes del protocolo Double Ratchet
pub const MAX_SKIP: u32 = 1000;            // Máximo de mensajes saltados
pub const MAX_MESSAGE_SIZE: usize = 65536; // 64KB máximo por mensaje
pub const ROOT_KEY_SIZE: usize = 32;       // 256 bits
pub const CHAIN_KEY_SIZE: usize = 32;      // 256 bits
pub const MESSAGE_KEY_SIZE: usize = 32;    // 256 bits
pub const HEADER_KEY_SIZE: usize = 32;     // 256 bits
pub const NONCE_SIZE: usize = 24;          // 192 bits (XChaCha20)
pub const AAD_MAX_SIZE: usize = 1024;      // 1KB máximo AAD
