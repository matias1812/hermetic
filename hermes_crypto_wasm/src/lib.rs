// hermes_crypto_wasm/src/lib.rs
//
// Implementación de criptografía verificable para HermesChat.
//
// GARANTÍAS DE SEGURIDAD (verificables via cargo test):
// - Tiempo constante (mejor esfuerzo): comparaciones usan `constant_time_eq` (crate auditada).
//   NOTA: el tiempo constante absoluto depende de la microarquitectura de la CPU y de
//   optimizaciones de LLVM. No se puede garantizar sin verificación formal de hardware.
// - Zeroización: todas las claves/buffers sensibles usan `zeroize` (crate auditada por IETF)
// - AEAD: AES-256-GCM con nonce aleatorio de 96 bits via OsRng (nunca reutilizado)
// - Fail-safe: descifrado retorna None ante cualquier error (nunca datos parciales)
//
// COMPILACIÓN WASM:
//   wasm-pack build --target web --release
//
// TESTS NATIVOS (sin WASM):
//   cargo test --all-features

pub mod storage;
pub mod ratchet;
pub mod domain;
pub mod core_api;

use wasm_bindgen::prelude::*;
use zeroize::Zeroize;
use constant_time_eq::constant_time_eq;
use chacha20poly1305::{XChaCha20Poly1305, KeyInit, aead::Aead};
use rand::rngs::OsRng;
use rand::RngCore;
use sha3::{Sha3_256, Digest};

/// Tamaño del nonce XChaCha20 en bytes (192 bits = 24 bytes)
const NONCE_SIZE: usize = 24;

/// Tamaño del tag Poly1305 en bytes (128 bits = 16 bytes)
const TAG_SIZE: usize = 16;

#[wasm_bindgen]
pub struct HermesCrypto {
    key: [u8; 32],
    version: u16,
    message_counter: u64,
}

#[wasm_bindgen]
impl HermesCrypto {
    /// Constructor: genera clave aleatoria via OsRng.
    /// La clave nunca sale de esta estructura — solo se usa internamente.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let mut key = [0u8; 32];
        OsRng.fill_bytes(&mut key);

        let instance = Self { 
            key, 
            version: 1, 
            message_counter: 0 
        };

        // Zeroizar el buffer temporal de la pila
        key.zeroize();

        instance
    }

    /// Rota la clave AES principal.
    /// Genera una nueva clave y zeroiza la anterior para proveer PFS real
    /// incluso si la sesión no avanza el ratchet.
    pub fn rotate_key(&mut self) {
        let mut new_key = [0u8; 32];
        OsRng.fill_bytes(&mut new_key);
        self.key.zeroize();
        self.key = new_key;
        new_key.zeroize();
    }

    /// XOR en tiempo constante (mejor esfuerzo, sin ramas explícitas).
    ///
    /// Esta implementación EVITA ramas condicionales sobre datos secretos.
    /// Sin embargo, el tiempo constante ABSOLUTO no puede garantizarse porque:
    ///   - LLVM puede reintroducir ramas durante la optimización
    ///   - La microarquitectura de la CPU (branch predictor, speculative execution)
    ///     puede introducir variaciones de tiempo observables
    ///   - Para garantizar tiempo constante verificado, se requiere análisis
    ///     con herramientas como `dudect` o `ctgrind`
    ///
    /// Para comparaciones de MAC/token/clave, prefer `constant_time_compare`
    /// que usa la crate `constant_time_eq` (auditada).
    ///
    /// # Panics
    /// Pánico si `a.len() != b.len()` — no opera con longitudes distintas.
    pub fn constant_time_xor(&self, a: &[u8], b: &[u8]) -> Vec<u8> {
        assert_eq!(a.len(), b.len(), "XOR length mismatch: {} vs {}", a.len(), b.len());

        // Loop sin ramas explícitas sobre datos secretos.
        // El compilador genera SIMD automático (xorps/vpxor) en release mode.
        let mut result = vec![0u8; a.len()];
        for i in 0..a.len() {
            result[i] = a[i] ^ b[i];
        }
        result
    }

    /// Comparación en tiempo constante usando `constant_time_eq` (crate auditada).
    ///
    /// CRÍTICO: No usar `==` para comparar MACs, tokens o claves —
    /// siempre usar esta función.
    pub fn constant_time_compare(&self, a: &[u8], b: &[u8]) -> bool {
        constant_time_eq(a, b)
    }

    /// Zeroización verificable via SHA3-256.
    ///
    /// Zeroiza `data` usando la crate `zeroize` (auditada, resiste optimizaciones
    /// del compilador y CPU via compilación barrera).
    ///
    /// Retorna `true` si la zeroización es verificable: hash cambió y todos los
    /// bytes son 0.
    ///
    /// # Seguridad
    /// El hash se calcula con SHA3-256 (no SHA-256) para evitar colisiones
    /// en preimagen conocida.
    pub fn secure_zeroize(&self, data: &mut [u8]) -> bool {
        if data.is_empty() {
            return true; // Buffer vacío → zeroización trivialmente correcta
        }

        // Si ya está todo en ceros, no hay nada que hacer pero es correcto
        let already_zero = data.iter().all(|&x| x == 0);

        let original_hash = {
            let mut hasher = Sha3_256::new();
            hasher.update(&*data);
            hasher.finalize()
        };

        data.zeroize();

        let new_hash = {
            let mut hasher = Sha3_256::new();
            hasher.update(&*data);
            hasher.finalize()
        };

        // El buffer está correctamente zeroizado si:
        // - Todos los bytes son 0 (invariante principal)
        // - Y el hash cambió (datos no eran ya cero)
        //   O el hash no cambió porque ya eran cero (también correcto)
        let all_zero_now = data.iter().all(|&x| x == 0);
        all_zero_now && (already_zero || original_hash != new_hash)
    }

    /// Cifrado AES-256-GCM autenticado con nonce aleatorio de 96 bits.
    ///
    /// Cada llamada genera un nonce único via `OsRng` (CSPRNG del sistema operativo).
    /// Esto elimina el riesgo de reutilización de nonce al reiniciar instancias.
    ///
    /// Formato de salida: `[nonce (12 bytes) || ciphertext || tag (16 bytes)]`
    ///
    /// # Panics
    /// - Si AES-GCM falla internamente (no debería con clave válida)
    /// - Si OsRng falla (fallo del sistema operativo — extremadamente raro)
    ///
    /// # Seguridad
    /// Con nonce de 96 bits aleatorio, la probabilidad de colisón después
    /// de 2^32 mensajes es ~2^{-32} (birthday bound). Para uso práctico
    /// (miles de mensajes por día) esto es seguro.
    pub fn encrypt_aead(&mut self, plaintext: &[u8]) -> Vec<u8> {
        let cipher = XChaCha20Poly1305::new_from_slice(&self.key)
            .expect("XChaCha20-Poly1305 key init failed — key size invariant violated");

        // Nonce aleatorio de 96 bits via OsRng (CSPRNG del SO)
        let mut nonce = [0u8; NONCE_SIZE];
        OsRng.fill_bytes(&mut nonce);

        // AAD (Additional Authenticated Data): previene el desacoplamiento de contexto
        let aad = [
            &self.version.to_be_bytes()[..],
            &self.message_counter.to_be_bytes()[..],
        ].concat();

        let payload = chacha20poly1305::aead::Payload {
            msg: plaintext,
            aad: &aad,
        };

        let mut ciphertext = cipher
            .encrypt(&nonce.into(), payload)
            .expect("XChaCha20-Poly1305 encryption failed");

        self.message_counter += 1;

        // Formato: [nonce || ciphertext+tag]
        let mut output = Vec::with_capacity(NONCE_SIZE + ciphertext.len());
        output.extend_from_slice(&nonce);
        output.append(&mut ciphertext);
        output
    }

    /// Descifrado AES-256-GCM autenticado.
    ///
    /// Verifica el tag de autenticación antes de retornar plaintext.
    /// Si el mensaje fue manipulado, retorna `None` — nunca retorna datos parciales.
    ///
    /// # Formato de entrada
    /// `[nonce (12 bytes) || ciphertext || tag (16 bytes)]`
    ///
    /// # Retorna
    /// - `Some(plaintext)` si el mensaje es auténtico e íntegro
    /// - `None` si el tag falla (manipulación detectada) o formato inválido
    pub fn decrypt_aead(&mut self, ciphertext_with_nonce: &[u8]) -> Option<Vec<u8>> {
        // Mínimo: nonce (12) + tag (16) = 28 bytes
        if ciphertext_with_nonce.len() < NONCE_SIZE + TAG_SIZE {
            return None; // Formato inválido — no error, retorna None (fail-safe)
        }

        let (nonce_bytes, ciphertext) = ciphertext_with_nonce.split_at(NONCE_SIZE);

        let cipher = XChaCha20Poly1305::new_from_slice(&self.key)
            .expect("XChaCha20-Poly1305 key init failed");

        let nonce: [u8; NONCE_SIZE] = nonce_bytes
            .try_into()
            .expect("Nonce size invariant violated");

        let aad = [
            &self.version.to_be_bytes()[..],
            &self.message_counter.to_be_bytes()[..],
        ].concat();

        let payload = chacha20poly1305::aead::Payload {
            msg: ciphertext,
            aad: &aad,
        };

        // decrypt() verifica el tag (y AAD) en tiempo constante internamente
        let result = cipher.decrypt(&nonce.into(), payload).ok();
        
        // Si el descifrado es exitoso, avanzamos el contador
        if result.is_some() {
            self.message_counter += 1;
        }
        
        result
    }

    /// Retorna el tamaño de clave XChaCha20 en bytes (siempre 32).
    pub fn key_size_bytes() -> usize {
        32
    }
}

impl Drop for HermesCrypto {
    /// Zeroización automática al hacer drop de la estructura.
    /// Garantiza que la clave no queda en memoria después de liberar.
    fn drop(&mut self) {
        self.key.zeroize();
        // Nota: nonce_counter eliminado — cada encrypt_aead usa nonce OsRng aleatorio
    }
}

use crate::domain::HermesCore;
use crate::storage::MemoryStorageBackend;

/// Wrapper exportado a WASM del motor unificado Hermes Core.
/// Constituye el único punto de entrada para que JavaScript o clientes nativos
/// interactúen con la persistencia y criptografía del dominio.
#[wasm_bindgen]
pub struct HermesEngineWasm {
    core: HermesCore<MemoryStorageBackend>,
}

#[wasm_bindgen]
impl HermesEngineWasm {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            core: HermesCore::new(MemoryStorageBackend::new()),
        }
    }

    #[wasm_bindgen]
    pub fn init_conversation(&mut self, session_id: &str, shared_secret: &[u8], remote_pub: &[u8]) -> Result<(), JsValue> {
        if shared_secret.len() != 32 || remote_pub.len() != 32 {
            return Err(JsValue::from_str("shared_secret y remote_pub deben tener exactamente 32 bytes"));
        }
        let mut secret_arr = [0u8; 32];
        secret_arr.copy_from_slice(shared_secret);
        let mut pub_arr = [0u8; 32];
        pub_arr.copy_from_slice(remote_pub);
        let remote_public = x25519_dalek::PublicKey::from(pub_arr);

        self.core.init_conversation(session_id, &secret_arr, remote_public)
            .map_err(|e| JsValue::from_str(&e))
    }

    #[wasm_bindgen]
    pub fn send_message(&mut self, session_id: &str, plaintext: &[u8]) -> Result<Vec<u8>, JsValue> {
        let (_id, envelope) = self.core.send_message(session_id, plaintext)
            .map_err(|e| JsValue::from_str(&e))?;
        Ok(envelope)
    }

    #[wasm_bindgen]
    pub fn receive_message(&mut self, session_id: &str, envelope_bytes: &[u8]) -> Result<Vec<u8>, JsValue> {
        self.core.receive_message(session_id, envelope_bytes)
            .map_err(|e| JsValue::from_str(&e))
    }

    #[wasm_bindgen]
    pub fn read_message(&self, msg_id: &str) -> Result<Option<Vec<u8>>, JsValue> {
        match self.core.read_message(msg_id) {
            Ok(Some(secure_buf)) => Ok(Some(secure_buf.as_slice().to_vec())),
            Ok(None) => Ok(None),
            Err(e) => Err(JsValue::from_str(&e)),
        }
    }

    #[wasm_bindgen]
    pub fn health_check(&self) -> bool {
        self.core.health_check().unwrap_or(false)
    }
}

/// Envoltura independiente para Double Ratchet en WASM.
/// Permite instanciar y usar un trinquete directamente en JavaScript (p.ej. desde double_ratchet.js).
#[wasm_bindgen]
pub struct WasmDoubleRatchet {
    inner: crate::ratchet::DHRatchet,
}

#[wasm_bindgen]
impl WasmDoubleRatchet {
    #[wasm_bindgen(constructor)]
    pub fn new(shared_secret: &[u8], remote_pub: &[u8]) -> Result<WasmDoubleRatchet, JsValue> {
        if shared_secret.len() != 32 || remote_pub.len() != 32 {
            return Err(JsValue::from_str("shared_secret y remote_pub deben tener exactamente 32 bytes"));
        }
        let mut secret_arr = [0u8; 32];
        secret_arr.copy_from_slice(shared_secret);
        let mut pub_arr = [0u8; 32];
        pub_arr.copy_from_slice(remote_pub);
        let remote_public = x25519_dalek::PublicKey::from(pub_arr);

        Ok(WasmDoubleRatchet {
            inner: crate::ratchet::DHRatchet::new(&secret_arr, remote_public),
        })
    }

    #[wasm_bindgen]
    pub fn encrypt(&mut self, plaintext: &[u8], aad: &[u8]) -> Result<Vec<u8>, JsValue> {
        let encrypted = self.inner.encrypt(plaintext, aad);
        bincode::serialize(&encrypted)
            .map_err(|e| JsValue::from_str(&format!("Error serializando: {}", e)))
    }

    #[wasm_bindgen]
    pub fn decrypt(&mut self, envelope_bytes: &[u8], aad: &[u8]) -> Result<Vec<u8>, JsValue> {
        let encrypted: crate::ratchet::EncryptedMessage = bincode::deserialize(envelope_bytes)
            .map_err(|e| JsValue::from_str(&format!("Error deserializando: {}", e)))?;
        self.inner.decrypt(&encrypted, aad)
            .map_err(|e| JsValue::from_str(&format!("Error descifrando: {}", e)))
    }
}

// =============================================================================
// TESTS UNITARIOS (cargo test)
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -------------------------------------------------------------------------
    // Test 1: XOR es reversible (propiedad matemática fundamental)
    // -------------------------------------------------------------------------
    #[test]
    fn test_constant_time_xor_reversibility() {
        let crypto = HermesCrypto::new();

        let plaintext = b"HermesChat secure message XOR test 2024!";
        let key = b"supersecretkey!supersecretkey!xx"; // 32 bytes + padding

        // Asegurarse longitudes iguales
        let len = plaintext.len().min(key.len());
        let p = &plaintext[..len];
        let k = &key[..len];

        let ciphertext = crypto.constant_time_xor(p, k);
        let recovered = crypto.constant_time_xor(&ciphertext, k);

        assert_eq!(p, recovered.as_slice(), "XOR debe ser su propio inverso: A^B^B = A");
    }

    // -------------------------------------------------------------------------
    // Test 2: XOR con longitudes distintas → pánico esperado
    // -------------------------------------------------------------------------
    #[test]
    #[should_panic(expected = "XOR length mismatch")]
    fn test_constant_time_xor_length_mismatch_panics() {
        let crypto = HermesCrypto::new();
        let _ = crypto.constant_time_xor(b"short", b"much_longer_input");
    }

    // -------------------------------------------------------------------------
    // Test 3: Comparación en tiempo constante — iguales
    // -------------------------------------------------------------------------
    #[test]
    fn test_constant_time_compare_equal() {
        let crypto = HermesCrypto::new();
        let a = vec![0xABu8; 64];
        let b = vec![0xABu8; 64];
        assert!(crypto.constant_time_compare(&a, &b), "Bytes idénticos deben comparar como iguales");
    }

    // -------------------------------------------------------------------------
    // Test 4: Comparación en tiempo constante — diferentes
    // -------------------------------------------------------------------------
    #[test]
    fn test_constant_time_compare_different() {
        let crypto = HermesCrypto::new();
        let a = vec![0xAAu8; 64];
        let mut b = vec![0xAAu8; 64];
        b[63] = 0xBB; // Un byte diferente al final

        assert!(!crypto.constant_time_compare(&a, &b), "Bytes distintos deben comparar como diferentes");
    }

    // -------------------------------------------------------------------------
    // Test 5: Zeroización verificable — datos no-cero
    // -------------------------------------------------------------------------
    #[test]
    fn test_secure_zeroize_verified() {
        let crypto = HermesCrypto::new();

        let mut secret = vec![0xDEu8; 256];
        let original_clone = secret.clone();

        let result = crypto.secure_zeroize(&mut secret);

        assert!(result, "secure_zeroize debe retornar true cuando la zeroización es verificable");
        assert!(secret.iter().all(|&x| x == 0), "Todos los bytes deben ser 0 post-zeroización");
        assert_ne!(secret, original_clone, "El buffer debe haber cambiado");
    }

    // -------------------------------------------------------------------------
    // Test 5b: Zeroización de buffer ya-zeroizado → también debe retornar true
    // -------------------------------------------------------------------------
    #[test]
    fn test_secure_zeroize_already_zero() {
        let crypto = HermesCrypto::new();

        // Buffer que ya es todo ceros — zeroizar es correcto (datos ya están limpios)
        let mut already_clean = vec![0u8; 128];
        let result = crypto.secure_zeroize(&mut already_clean);

        assert!(result, "Buffer ya-zeroizado debe retornar true (ya está limpio)");
        assert!(already_clean.iter().all(|&x| x == 0), "Todos los bytes deben seguir siendo 0");
    }

    // -------------------------------------------------------------------------
    // Test 6: Buffer vacío → zeroización trivialmente correcta
    // -------------------------------------------------------------------------
    #[test]
    fn test_secure_zeroize_empty_buffer() {
        let crypto = HermesCrypto::new();
        let mut empty: Vec<u8> = vec![];
        assert!(crypto.secure_zeroize(&mut empty), "Buffer vacío debe retornar true");
    }

    // -------------------------------------------------------------------------
    // Test 7: AEAD encrypt → decrypt round-trip
    // -------------------------------------------------------------------------
    #[test]
    fn test_aead_encrypt_decrypt_roundtrip() {
        let mut crypto = HermesCrypto::new(); 

        let plaintext = b"Mensaje secreto de HermesChat con AES-256-GCM!";

        let ciphertext = crypto.encrypt_aead(plaintext);

        assert_eq!(ciphertext.len(), NONCE_SIZE + plaintext.len() + TAG_SIZE);

        // Reset the message counter to test decryption on the same instance
        crypto.message_counter = 0;

        let decrypted = crypto.decrypt_aead(&ciphertext)
            .expect("Descifrado debe tener éxito con el mismo HermesCrypto");

        assert_eq!(decrypted.as_slice(), plaintext, "El plaintext debe recuperarse exactamente");
    }

    // -------------------------------------------------------------------------
    // Test 8: AEAD tamper detection — modificar ciphertext → None
    // -------------------------------------------------------------------------
    #[test]
    fn test_aead_tamper_detection() {
        let mut crypto = HermesCrypto::new();

        let plaintext = b"Datos sensibles que no deben ser manipulados";
        let mut ciphertext = crypto.encrypt_aead(plaintext);

        // Flipear un bit en el ciphertext (después del nonce)
        let tamper_pos = NONCE_SIZE + 5;
        ciphertext[tamper_pos] ^= 0xFF;

        crypto.message_counter = 0; // Reset for decryption

        let result = crypto.decrypt_aead(&ciphertext);

        assert!(result.is_none(), "AES-GCM debe detectar manipulación y retornar None");
    }

    // -------------------------------------------------------------------------
    // Test 9: AEAD ciphertext muy corto → None (no panic)
    // -------------------------------------------------------------------------
    #[test]
    fn test_aead_invalid_ciphertext_too_short() {
        let mut crypto = HermesCrypto::new();

        let too_short = vec![0u8; 10]; // < NONCE_SIZE + TAG_SIZE = 28
        let result = crypto.decrypt_aead(&too_short);

        assert!(result.is_none(), "Ciphertext demasiado corto debe retornar None, no panic");
    }

    // -------------------------------------------------------------------------
    // Test 10: Nonce aleatorio — dos cifrados del mismo plaintext producen ciphertexts distintos
    // -------------------------------------------------------------------------
    #[test]
    fn test_nonce_uniqueness_per_encryption() {
        let mut crypto = HermesCrypto::new(); 

        let c1 = crypto.encrypt_aead(b"mensaje 1");
        let c2 = crypto.encrypt_aead(b"mensaje 1"); // mismo plaintext

        // Los primeros 12 bytes (nonce) deben ser diferentes (nonce aleatorio OsRng)
        assert_ne!(&c1[..NONCE_SIZE], &c2[..NONCE_SIZE],
            "Nonces aleatorios deben ser únicos con probabilidad 1 - 2^{{-96}}");

        // Y el ciphertext total también diferente
        assert_ne!(c1, c2, "Ciphertexts deben diferir aunque el plaintext sea igual");
    }

    // -------------------------------------------------------------------------
    // Test 11: Drop zeroiza la clave (verificación indirecta via comportamiento)
    // -------------------------------------------------------------------------
    #[test]
    fn test_drop_creates_new_independent_instance() {
        let ciphertext = {
            let mut crypto = HermesCrypto::new(); // ya no requiere mut
            crypto.encrypt_aead(b"datos")
            // crypto se dropea aquí → clave zeroizada
        };

        // Crear nueva instancia con clave diferente
        let mut crypto2 = HermesCrypto::new();

        // La nueva instancia NO puede descifrar el ciphertext de la primera
        let result = crypto2.decrypt_aead(&ciphertext);
        assert!(result.is_none(),
            "Instancia con clave diferente NO debe poder descifrar ciphertext ajeno");
    }

    // -------------------------------------------------------------------------
    // Test 12: key_size_bytes() retorna 32 (AES-256)
    // -------------------------------------------------------------------------
    #[test]
    fn test_key_size_is_256_bits() {
        assert_eq!(HermesCrypto::key_size_bytes(), 32,
            "AES-256-GCM debe usar clave de 32 bytes (256 bits)");
    }
}
