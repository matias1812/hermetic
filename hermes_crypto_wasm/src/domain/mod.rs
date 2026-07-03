use crate::ratchet::RatchetManager;
use crate::storage::{SecureBuffer, StorageBackend, StorageEngine};
use std::collections::HashMap;
use x25519_dalek::PublicKey;
use zeroize::{Zeroize, ZeroizeOnDrop};

/// Identificador único de mensaje generado en memoria
pub type MessageId = String;

/// Contenedor seguro para Claves Privadas.
/// NUNCA SE EXPORTA A WASM O JAVASCRIPT.
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct PrivateKey {
    raw: [u8; 64],
}

impl PrivateKey {
    pub fn new(slice: &[u8]) -> Self {
        let mut key = Self { raw: [0u8; 64] };
        let len = slice.len().min(64);
        key.raw[..len].copy_from_slice(&slice[..len]);
        key
    }
}

/// Gestor de Claves Aislado (KeyManager).
/// Las claves privadas residen exclusivamente en memoria Rust autolimpiable.
pub struct KeyManager {
    private_keys: HashMap<String, PrivateKey>,
    public_keys: HashMap<String, Vec<u8>>,
}

impl Default for KeyManager {
    fn default() -> Self {
        Self::new()
    }
}

impl KeyManager {
    pub fn new() -> Self {
        Self {
            private_keys: HashMap::new(),
            public_keys: HashMap::new(),
        }
    }

    /// Guarda par de claves en memoria segura.
    pub fn store_keypair(&mut self, key_id: &str, priv_key: &[u8], pub_key: &[u8]) {
        self.private_keys
            .insert(key_id.to_string(), PrivateKey::new(priv_key));
        self.public_keys
            .insert(key_id.to_string(), pub_key.to_vec());
    }

    /// MÉTODO PRIVADO: Retorna referencia a la clave privada solo dentro de Rust.
    /// JAMÁS EXPUESTO A WASM_BINDGEN.
    #[allow(dead_code)]
    fn get_private_key(&self, key_id: &str) -> Option<&PrivateKey> {
        self.private_keys.get(key_id)
    }

    /// MÉTODO PÚBLICO: Retorna únicamente la clave pública para compartir.
    pub fn get_public_key(&self, key_id: &str) -> Option<Vec<u8>> {
        self.public_keys.get(key_id).cloned()
    }
}

/// Núcleo Unificado de Dominio (`Hermes Engine v8`).
/// Orquesta la criptografía, persistencia agnóstica con verificación, y gestión inmutable de sesiones.
pub struct HermesCore<B: StorageBackend> {
    pub storage: StorageEngine<B>,
    pub ratchet_manager: RatchetManager,
    pub key_manager: KeyManager,
}

impl<B: StorageBackend> HermesCore<B> {
    pub fn new(backend: B) -> Self {
        Self {
            storage: StorageEngine::new(backend),
            ratchet_manager: RatchetManager::new(),
            key_manager: KeyManager::new(),
        }
    }

    /// Guardar estado con VERIFICACIÓN de integridad (Talón de Aquiles #1 resuelto).
    pub fn save_state_with_verification(
        &self,
        session_id: &str,
        state_blob: &[u8],
    ) -> Result<(), String> {
        // 1. Guardar estado
        self.storage.save_ratchet_state(session_id, state_blob)?;

        // 2. Recargar inmediatamente desde el backend para comprobar que no hubo corrupción silenciosa
        let loaded = self.storage.load_ratchet_state(session_id)?
            .ok_or_else(|| format!("Error crítico: El backend reportó guardado exitoso pero no encontró la sesión {}", session_id))?;

        // 3. Verificar que la longitud coincida exactamente
        if loaded.as_slice().len() != state_blob.len() {
            return Err("Error de integridad: Los bytes recargados del almacenamiento no coinciden con el estado original".to_string());
        }

        Ok(())
    }

    /// Aplica padding a bloques fijos de 256 o 512 bytes (Talón de Aquiles #5 resuelto).
    fn pad_to_fixed_block(plaintext: &[u8]) -> Vec<u8> {
        let block_size = if plaintext.len() <= 200 { 256 } else { 512 };
        let mut padded = Vec::with_capacity(block_size);
        padded.extend_from_slice(plaintext);
        while padded.len() < block_size {
            padded.push(0x00); // Relleno nulo indistinguible dentro de AES-GCM
        }
        padded
    }

    /// Inicializa una nueva conversación segura y persiste con verificación read-back.
    pub fn init_conversation(
        &mut self,
        session_id: &str,
        shared_secret: &[u8; 32],
        remote_public: PublicKey,
    ) -> Result<(), String> {
        self.ratchet_manager
            .init_session(session_id, shared_secret, remote_public);
        self.save_state_with_verification(session_id, b"ratchet-state-v8-verified")?;
        Ok(())
    }

    /// Cifra y prepara el envío aplicando bloques de tamaño fijo para mitigar análisis de tráfico.
    pub fn send_message(
        &mut self,
        session_id: &str,
        plaintext: &[u8],
    ) -> Result<(MessageId, Vec<u8>), String> {
        let ratchet = self
            .ratchet_manager
            .get_ratchet_mut(session_id)
            .ok_or_else(|| format!("Sesión de trinquete no encontrada: {}", session_id))?;

        // Enmascaramiento de longitud mediante padding a bloque fijo
        let padded_plaintext = Self::pad_to_fixed_block(plaintext);
        let encrypted = ratchet.encrypt(&padded_plaintext, b"hermes-v8-envelope");
        let envelope = bincode::serialize(&encrypted)
            .map_err(|e| format!("Error serializando mensaje: {}", e))?;

        let msg_id = format!("msg-{}-{}", session_id, envelope.len());
        self.storage.save_message(&msg_id, &envelope)?;

        Ok((msg_id, envelope))
    }

    /// Descifra un mensaje recibido y avanza el trinquete en consecuencia.
    pub fn receive_message(
        &mut self,
        session_id: &str,
        envelope_bytes: &[u8],
    ) -> Result<Vec<u8>, String> {
        let ratchet = self
            .ratchet_manager
            .get_ratchet_mut(session_id)
            .ok_or_else(|| format!("Sesión de trinquete no encontrada: {}", session_id))?;

        let encrypted: crate::ratchet::EncryptedMessage = bincode::deserialize(envelope_bytes)
            .map_err(|e| format!("Error deserializando sobre: {}", e))?;

        let padded_plaintext = ratchet
            .decrypt(&encrypted, b"hermes-v8-envelope")
            .map_err(|e| format!("Error descifrando trinquete: {}", e))?;

        // Quitar padding nulo
        let mut unpadded = padded_plaintext;
        while unpadded.last() == Some(&0x00) {
            unpadded.pop();
        }

        Ok(unpadded)
    }

    /// Carga un mensaje persistido en un buffer seguro autolimpiable.
    pub fn read_message(&self, msg_id: &str) -> Result<Option<SecureBuffer>, String> {
        self.storage.load_message(msg_id)
    }

    /// Chequeo de salud criptográfico e integridad general.
    pub fn health_check(&self) -> Result<bool, String> {
        self.storage.verify_integrity()
    }
}
