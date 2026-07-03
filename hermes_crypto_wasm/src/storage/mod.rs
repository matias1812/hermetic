use zeroize::{Zeroize, ZeroizeOnDrop};

/// Trait abstracto para backends de almacenamiento del motor Hermes.
/// Permite acoplar agnósticamente IndexedDB (Web vía WASM), SQLite o RocksDB (Desktop/CLI).
pub trait StorageBackend {
    fn save(&self, key: &str, data: &[u8]) -> Result<(), String>;
    fn load(&self, key: &str) -> Result<Option<Vec<u8>>, String>;
    fn delete(&self, key: &str) -> Result<(), String>;
    fn list_keys(&self, prefix: &str) -> Result<Vec<String>, String>;
    fn integrity_check(&self) -> Result<bool, String>;
}

/// Contenedor de datos sensibles cargados en memoria que garantiza
/// sobrescritura con ceros (zeroize) en cuanto sale de alcance o es eliminado.
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct SecureBuffer {
    data: Vec<u8>,
}

impl SecureBuffer {
    pub fn new(slice: &[u8]) -> Self {
        Self {
            data: slice.to_vec(),
        }
    }

    pub fn as_slice(&self) -> &[u8] {
        &self.data
    }
}

/// Motor de Almacenamiento Centralizado (StorageEngine).
/// Actúa como mediador seguro entre la lógica de dominio (Hermes Core) y el backend real.
pub struct StorageEngine<B: StorageBackend> {
    backend: B,
}

impl<B: StorageBackend> StorageEngine<B> {
    pub fn new(backend: B) -> Self {
        Self { backend }
    }

    /// Guarda un sobre cifrado en el backend, aplicando validación de llave.
    pub fn save_message(&self, msg_id: &str, encrypted_envelope: &[u8]) -> Result<(), String> {
        if msg_id.is_empty() || encrypted_envelope.is_empty() {
            return Err("Identificador o sobre vacío inviolable".to_string());
        }
        let storage_key = format!("msg:{}", msg_id);
        self.backend.save(&storage_key, encrypted_envelope)
    }

    /// Recupera un mensaje y lo envuelve en un buffer seguro autolimpiable.
    pub fn load_message(&self, msg_id: &str) -> Result<Option<SecureBuffer>, String> {
        let storage_key = format!("msg:{}", msg_id);
        match self.backend.load(&storage_key)? {
            Some(data) => Ok(Some(SecureBuffer::new(&data))),
            None => Ok(None),
        }
    }

    /// Guarda el estado crítico del trinquete doble (Double Ratchet CKs/CKr).
    pub fn save_ratchet_state(&self, session_id: &str, state_blob: &[u8]) -> Result<(), String> {
        let storage_key = format!("ratchet:{}", session_id);
        self.backend.save(&storage_key, state_blob)
    }

    /// Carga el estado del trinquete en un buffer autolimpiable en RAM.
    pub fn load_ratchet_state(&self, session_id: &str) -> Result<Option<SecureBuffer>, String> {
        let storage_key = format!("ratchet:{}", session_id);
        match self.backend.load(&storage_key)? {
            Some(data) => Ok(Some(SecureBuffer::new(&data))),
            None => Ok(None),
        }
    }

    /// Almacena claves criptográficas persistentes del usuario (ML-KEM / SPHINCS+).
    pub fn save_key(&self, key_id: &str, raw_key: &[u8]) -> Result<(), String> {
        let storage_key = format!("key:{}", key_id);
        self.backend.save(&storage_key, raw_key)
    }

    /// Carga clave criptográfica persistente en buffer autolimpiable.
    pub fn load_key(&self, key_id: &str) -> Result<Option<SecureBuffer>, String> {
        let storage_key = format!("key:{}", key_id);
        match self.backend.load(&storage_key)? {
            Some(data) => Ok(Some(SecureBuffer::new(&data))),
            None => Ok(None),
        }
    }

    /// Ejecuta chequeo de integridad sobre el backend conectado.
    pub fn verify_integrity(&self) -> Result<bool, String> {
        self.backend.integrity_check()
    }
}

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Backend de almacenamiento en memoria protegida por mutex para WASM y tests nativos.
/// Permite ejecutar y auditar el motor sin dependencias externas inmediatas de disco.
#[derive(Clone)]
pub struct MemoryStorageBackend {
    store: Arc<Mutex<HashMap<String, Vec<u8>>>>,
}

impl Default for MemoryStorageBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl MemoryStorageBackend {
    pub fn new() -> Self {
        Self {
            store: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl StorageBackend for MemoryStorageBackend {
    fn save(&self, key: &str, data: &[u8]) -> Result<(), String> {
        let mut map = self.store.lock().map_err(|e| e.to_string())?;
        map.insert(key.to_string(), data.to_vec());
        Ok(())
    }

    fn load(&self, key: &str) -> Result<Option<Vec<u8>>, String> {
        let map = self.store.lock().map_err(|e| e.to_string())?;
        Ok(map.get(key).cloned())
    }

    fn delete(&self, key: &str) -> Result<(), String> {
        let mut map = self.store.lock().map_err(|e| e.to_string())?;
        map.remove(key);
        Ok(())
    }

    fn list_keys(&self, prefix: &str) -> Result<Vec<String>, String> {
        let map = self.store.lock().map_err(|e| e.to_string())?;
        let keys = map
            .keys()
            .filter(|k| k.starts_with(prefix))
            .cloned()
            .collect();
        Ok(keys)
    }

    fn integrity_check(&self) -> Result<bool, String> {
        Ok(self.store.lock().is_ok())
    }
}
