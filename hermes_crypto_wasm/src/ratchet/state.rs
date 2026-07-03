use crate::ratchet::constants::*;
use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

/// Una clave saltada (para mensajes fuera de orden)
#[derive(Clone, Serialize, Deserialize)]
pub struct SkippedKey {
    /// Clave pública del remoto cuando se saltó
    pub dh_remote: [u8; 32],
    /// Número de mensaje saltado
    pub message_number: u32,
    /// Message Key saltada
    pub message_key: [u8; MESSAGE_KEY_SIZE],
}

/// Estado completo del Double Ratchet para UNA conversación
#[derive(Clone, Serialize, Deserialize)]
pub struct RatchetState {
    /// Root Key (RK) - 32 bytes
    pub root_key: [u8; ROOT_KEY_SIZE],

    /// Sending Chain Key (CKs) - 32 bytes
    pub sending_chain_key: [u8; CHAIN_KEY_SIZE],

    /// Receiving Chain Key (CKr) - 32 bytes
    pub receiving_chain_key: [u8; CHAIN_KEY_SIZE],

    /// Header Key Sending (HKs) - 32 bytes
    pub header_key_send: [u8; HEADER_KEY_SIZE],

    /// Header Key Receiving (HKr) - 32 bytes
    pub header_key_recv: [u8; HEADER_KEY_SIZE],

    /// Next Header Key Sending (NHKs) - 32 bytes
    pub next_header_key_send: Option<[u8; HEADER_KEY_SIZE]>,

    /// Next Header Key Receiving (NHKr) - 32 bytes
    pub next_header_key_recv: Option<[u8; HEADER_KEY_SIZE]>,

    /// Nuestra clave privada DH (X25519)
    #[serde(with = "serde_static_secret")]
    pub dh_private: [u8; 32],

    /// Nuestra clave pública DH (X25519)
    pub dh_public: [u8; 32],

    /// Clave pública del remoto (X25519)
    pub dh_remote: Option<[u8; 32]>,

    /// Número de mensajes enviados (Ns)
    pub message_number_sent: u32,

    /// Número de mensajes recibidos (Nr)
    pub message_number_recv: u32,

    /// Número previo de mensajes enviados (PN)
    pub prev_message_number: u32,

    /// Claves saltadas para mensajes fuera de orden (MKSKIPPED)
    pub skipped_keys: Vec<SkippedKey>,

    /// Versión del protocolo
    pub protocol_version: u8,
}

impl RatchetState {
    /// Crear un nuevo estado de ratchet (por defecto como Alice/iniciador)
    pub fn new(shared_secret: &[u8; 32]) -> Self {
        Self::new_with_role(shared_secret, true)
    }

    /// Crear un nuevo estado de ratchet especificando rol (iniciador o receptor)
    pub fn new_with_role(shared_secret: &[u8; 32], _is_alice: bool) -> Self {
        Self {
            root_key: *shared_secret,
            sending_chain_key: [0u8; CHAIN_KEY_SIZE],
            receiving_chain_key: [0u8; CHAIN_KEY_SIZE],
            header_key_send: [0u8; HEADER_KEY_SIZE],
            header_key_recv: [0u8; HEADER_KEY_SIZE],
            next_header_key_send: None,
            next_header_key_recv: None,
            dh_private: [0u8; 32],
            dh_public: [0u8; 32],
            dh_remote: None,
            message_number_sent: 0,
            message_number_recv: 0,
            prev_message_number: 0,
            skipped_keys: Vec::new(),
            protocol_version: 2,
        }
    }

    /// Verificar integridad del estado
    pub fn verify_integrity(&self) -> bool {
        self.root_key != [0u8; ROOT_KEY_SIZE]
            && self.sending_chain_key != [0u8; CHAIN_KEY_SIZE]
            && self.receiving_chain_key != [0u8; CHAIN_KEY_SIZE]
            && self.header_key_send != [0u8; HEADER_KEY_SIZE]
            && self.header_key_recv != [0u8; HEADER_KEY_SIZE]
    }

    /// Calcular checksum del estado
    pub fn checksum(&self) -> [u8; 32] {
        use sha2::{Digest, Sha256};
        let serialized = bincode::serialize(self).unwrap_or_default();
        let mut hasher = Sha256::new();
        hasher.update(&serialized);
        hasher.finalize().into()
    }
}

impl Drop for RatchetState {
    fn drop(&mut self) {
        self.root_key.zeroize();
        self.sending_chain_key.zeroize();
        self.receiving_chain_key.zeroize();
        self.header_key_send.zeroize();
        self.header_key_recv.zeroize();
        if let Some(mut k) = self.next_header_key_send {
            k.zeroize();
        }
        if let Some(mut k) = self.next_header_key_recv {
            k.zeroize();
        }
        self.dh_private.zeroize();
        for sk in &mut self.skipped_keys {
            sk.message_key.zeroize();
        }
        self.skipped_keys.clear();
    }
}

// Serialización segura para StaticSecret
mod serde_static_secret {
    pub fn serialize<S>(secret: &[u8; 32], serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_bytes(secret)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<[u8; 32], D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let bytes: Vec<u8> = serde::Deserialize::deserialize(deserializer)?;
        let mut arr = [0u8; 32];
        let len = bytes.len().min(32);
        arr[..len].copy_from_slice(&bytes[..len]);
        Ok(arr)
    }
}
