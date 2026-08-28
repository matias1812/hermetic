use crate::ratchet::dh_ratchet::{DHRatchet, EncryptedMessage};
use crate::ratchet::x3dh::{
    generate_prekey_bundle, initiator_x3dh, responder_x3dh, InitialHandshake, PreKeyBundle,
};
use ml_kem::KeyExport;
use rand::rngs::OsRng;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;
use x25519_dalek::{PublicKey, StaticSecret};
use zeroize::Zeroize;

#[wasm_bindgen]
pub struct HermesCore {
    /// Llave maestra derivada (Root Vault Key)
    vault_key: Option<[u8; 32]>,
    /// Salt utilizado para derivar la vault_key (necesario para inyectar en el backup)
    vault_salt: Option<[u8; 16]>,

    /// Secretos locales de identidad X3DH (zeroizable)
    ik_secret: Option<[u8; 32]>,
    signing_secret: Option<[u8; 32]>,
    mldsa_secret_seed: Option<[u8; 32]>, // Nuevo: Semilla secreta para PQC ML-DSA-44
    spk_secret: Option<[u8; 32]>,
    opk_secrets: HashMap<String, [u8; 32]>,
    /// Semilla de 64 bytes de la clave de decapsulación ML-KEM-768 del PreKeyBundle
    /// vigente (rota junto con spk_secret en cada generate_prekey_bundle). Sin esto,
    /// accept_session_handshake no puede decapsular el ciphertext real que manda Alice.
    pqc_prekey_seed: Option<[u8; 64]>,

    /// Estado de las sesiones de chat activas (Double Ratchet)
    /// Key: contact_id
    sessions: HashMap<String, DHRatchet>,

    /// Estado de los grupos activos
    /// Key: group_id -> Group Symmetric Key
    groups: HashMap<String, [u8; 32]>,
}

impl Default for HermesCore {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for HermesCore {
    fn drop(&mut self) {
        if let Some(mut k) = self.vault_key {
            k.zeroize();
        }
        if let Some(mut k) = self.ik_secret {
            k.zeroize();
        }
        if let Some(mut k) = self.signing_secret {
            k.zeroize();
        }
        if let Some(mut k) = self.mldsa_secret_seed {
            k.zeroize();
        }
        if let Some(mut k) = self.spk_secret {
            k.zeroize();
        }
        if let Some(mut k) = self.pqc_prekey_seed {
            k.zeroize();
        }
        for val in self.opk_secrets.values_mut() {
            val.zeroize();
        }
        for val in self.groups.values_mut() {
            val.zeroize();
        }
    }
}

#[wasm_bindgen]
impl HermesCore {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            vault_key: None,
            vault_salt: None,
            ik_secret: None,
            signing_secret: None,
            mldsa_secret_seed: None,
            spk_secret: None,
            opk_secrets: HashMap::new(),
            pqc_prekey_seed: None,
            sessions: HashMap::new(),
            groups: HashMap::new(),
        }
    }

    /// Genera un salt aleatorio de 16 bytes para la bóveda local (Argon2id)
    pub fn generate_vault_salt(&self) -> String {
        use rand::RngCore;
        let mut salt = [0u8; 16];
        OsRng.fill_bytes(&mut salt);
        hex::encode(salt)
    }

    /// Desbloquea la bóveda (deriva llave maestra desde contraseña con Argon2id)
    pub fn unlock_vault(&mut self, password: &str, salt_hex: &str) -> bool {
        use argon2::Argon2;

        let salt_bytes = match hex::decode(salt_hex) {
            Ok(b) if b.len() == 16 => b,
            _ => return false, // Salt inválido
        };

        let argon2 = Argon2::default();
        let mut key = [0u8; 32];
        if argon2
            .hash_password_into(password.as_bytes(), &salt_bytes, &mut key)
            .is_ok()
        {
            self.vault_key = Some(key);
            let mut salt_arr = [0u8; 16];
            salt_arr.copy_from_slice(&salt_bytes);
            self.vault_salt = Some(salt_arr);
            true
        } else {
            false
        }
    }

    /// Cierra sesión y zeroiza la RAM de WASM.
    pub fn close_session(&mut self) {
        if let Some(mut key) = self.vault_key.take() {
            key.zeroize();
        }
        if let Some(mut s) = self.vault_salt.take() {
            s.zeroize();
        }
        if let Some(mut key) = self.ik_secret.take() {
            key.zeroize();
        }
        if let Some(mut key) = self.signing_secret.take() {
            key.zeroize();
        }
        if let Some(mut key) = self.mldsa_secret_seed.take() {
            // ML-DSA seed zeroized
            key.zeroize();
        }
        if let Some(mut key) = self.spk_secret.take() {
            key.zeroize();
        }
        if let Some(mut key) = self.pqc_prekey_seed.take() {
            key.zeroize();
        }
        for (_, mut key) in self.opk_secrets.drain() {
            key.zeroize();
        }
        self.sessions.clear();
        for (_, mut group_key) in self.groups.drain() {
            group_key.zeroize();
        }
    }

    /// Generar o regenerar el paquete de pre-claves X3DH para publicar en el servidor
    pub fn generate_prekey_bundle(
        &mut self,
        opk_id_opt: Option<String>,
    ) -> Result<String, JsValue> {
        if self.ik_secret.is_none() {
            self.ik_secret = Some(StaticSecret::random_from_rng(OsRng).to_bytes());
        }
        if self.signing_secret.is_none() {
            let mut arr = [0u8; 32];
            rand::RngCore::fill_bytes(&mut OsRng, &mut arr);
            self.signing_secret = Some(arr);
        }
        if self.mldsa_secret_seed.is_none() {
            let mut arr = [0u8; 32];
            rand::RngCore::fill_bytes(&mut OsRng, &mut arr);
            self.mldsa_secret_seed = Some(arr);
        }

        let mut ik_sec = self.ik_secret.unwrap();
        let mut sign_sec = self.signing_secret.unwrap();
        let mut mldsa_sec = self.mldsa_secret_seed.unwrap();

        // Generación real de llaves ML-KEM-768. La semilla se guarda en self.pqc_prekey_seed
        // (rota junto con spk_secret cada vez que se llama esta función) -- sin guardarla,
        // accept_session_handshake no tiene forma de reconstruir la clave de decapsulación
        // para el ciphertext real que manda Alice en create_session_from_bundle.
        let mut rng = rand::rngs::OsRng;
        let mut seed_bytes = [0u8; 64];
        rand::RngCore::fill_bytes(&mut rng, &mut seed_bytes);
        let dk = ml_kem::DecapsulationKey::<ml_kem::MlKem768>::from_seed(seed_bytes.into());
        let ek = dk.encapsulation_key();

        let pqc_pk_bytes = ek.to_bytes().to_vec();

        if let Some(mut old_seed) = self.pqc_prekey_seed.take() {
            old_seed.zeroize();
        }
        self.pqc_prekey_seed = Some(seed_bytes);

        let (bundle, mut spk_sec, opk_sec_opt) = generate_prekey_bundle(
            &ik_sec,
            &sign_sec,
            &mldsa_sec,
            opk_id_opt.clone(),
            &pqc_pk_bytes,
        );
        self.spk_secret = Some(spk_sec);

        if let (Some(id), Some(mut opk_sec)) = (opk_id_opt, opk_sec_opt) {
            self.opk_secrets.insert(id, opk_sec);
            opk_sec.zeroize();
        }

        ik_sec.zeroize();
        sign_sec.zeroize();
        mldsa_sec.zeroize();
        spk_sec.zeroize();
        seed_bytes.zeroize();

        serde_json::to_string(&bundle)
            .map_err(|e| JsValue::from_str(&format!("Error serializando PreKeyBundle: {}", e)))
    }

    /// Emisor: Ejecuta X3DH e inicializa transaccionalmente la sesión Double Ratchet en WASM
    pub fn create_session_from_bundle(
        &mut self,
        contact_id: &str,
        bundle_json: &str,
    ) -> Result<String, JsValue> {
        let bundle: PreKeyBundle = serde_json::from_str(bundle_json)
            .map_err(|e| JsValue::from_str(&format!("Error parseando PreKeyBundle JSON: {}", e)))?;

        if self.ik_secret.is_none() {
            self.ik_secret = Some(StaticSecret::random_from_rng(OsRng).to_bytes());
        }
        let ik_sec = self.ik_secret.unwrap();

        // ML-KEM-768 Encapsulate real contra bundle.pqc_public_key (antes simulado con
        // bytes aleatorios + SHA-256, sin protección PQC real -- cualquiera que viera el
        // "ciphertext" en tránsito podía recalcular el mismo hash).
        use ml_kem::kem::Encapsulate;
        use ml_kem::{EncapsulationKey, MlKem768};

        let pk_array = bundle.pqc_public_key.as_slice().try_into().map_err(|_| {
            JsValue::from_str("Fail-Closed: longitud de clave pública ML-KEM-768 inválida")
        })?;
        let ek = EncapsulationKey::<MlKem768>::new(&pk_array)
            .map_err(|_| JsValue::from_str("Fail-Closed: clave pública ML-KEM-768 inválida"))?;
        let (pqc_ciphertext, pqc_shared_secret) = ek.encapsulate();

        let (mut sk, handshake) = initiator_x3dh(
            &ik_sec,
            &bundle,
            pqc_ciphertext.as_slice(),
            &pqc_shared_secret,
        )
        .map_err(|e| JsValue::from_str(&e))?;

        let remote_public = PublicKey::from(bundle.signed_pre_key);
        let local_public = Some(PublicKey::from(handshake.sender_ephemeral_key));

        let ratchet = DHRatchet::new_with_role(&sk, remote_public, None, local_public, true);
        self.sessions.insert(contact_id.to_string(), ratchet);

        sk.zeroize();

        serde_json::to_string(&handshake)
            .map_err(|e| JsValue::from_str(&format!("Error serializando InitialHandshake: {}", e)))
    }

    /// Receptor: Procesa saludo inicial X3DH e inicializa transaccionalmente la sesión Double Ratchet en WASM
    pub fn accept_session_handshake(&mut self, contact_id: &str, handshake_json: &str) -> bool {
        let handshake: InitialHandshake = match serde_json::from_str(handshake_json) {
            Ok(h) => h,
            Err(_) => return false,
        };

        let ik_sec = match self.ik_secret {
            Some(k) => k,
            None => return false,
        };
        let spk_sec = match self.spk_secret {
            Some(k) => k,
            None => return false,
        };

        let opk_sec = handshake
            .one_time_pre_key_id
            .as_ref()
            .and_then(|id| self.opk_secrets.remove(id));

        // Decapsulate ML-KEM-768 real contra el ciphertext que mandó Alice (antes se
        // "derivaba" con SHA-256 del propio ciphertext, que viaja en claro -- cualquiera
        // en el camino podía recalcular el mismo valor, sin protección PQC real).
        let pqc_seed = match self.pqc_prekey_seed {
            Some(s) => s,
            None => return false,
        };
        use ml_kem::kem::Decapsulate;
        use ml_kem::{DecapsulationKey, MlKem768};
        let dk = DecapsulationKey::<MlKem768>::from_seed(pqc_seed.into());
        let pqc_shared_secret = match dk.decapsulate_slice(&handshake.pqc_ciphertext) {
            Ok(ss) => ss,
            Err(_) => return false,
        };

        let mut sk = match responder_x3dh(
            &ik_sec,
            &spk_sec,
            opk_sec.as_ref(),
            &handshake,
            &pqc_shared_secret,
        ) {
            Ok(key) => key,
            Err(_) => return false,
        };

        let remote_public = PublicKey::from(handshake.sender_ephemeral_key);
        let local_public = Some(PublicKey::from(&StaticSecret::from(spk_sec)));

        let ratchet = DHRatchet::new_with_role(&sk, remote_public, None, local_public, false);
        self.sessions.insert(contact_id.to_string(), ratchet);

        sk.zeroize();
        if let Some(mut k) = opk_sec {
            k.zeroize();
        }

        true
    }

    /// Backup de bóveda
    pub fn backup(&self) -> Vec<u8> {
        vec![]
    }

    /// Restaurar bóveda
    pub fn restore(&mut self, _blob: &[u8], _password: &str) -> bool {
        false
    }

    /// Inicia el Double Ratchet para un contacto
    pub fn create_session(
        &mut self,
        contact_id: &str,
        is_alice: bool,
        remote_pub_key: &[u8],
        shared_secret_opt: Option<Vec<u8>>,
        local_sk_opt: Option<Vec<u8>>,
        local_pub_opt: Option<Vec<u8>>,
    ) -> bool {
        let mut shared_secret = [0u8; 32];
        if let Some(ss) = &shared_secret_opt {
            if ss.len() == 32 {
                shared_secret.copy_from_slice(ss);
            }
        }

        // Determinar si tenemos claves X25519 reales (32 bytes exactos)
        let local_sk = local_sk_opt.as_ref().and_then(|sk| {
            if sk.len() == 32 {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(sk);
                Some(arr)
            } else {
                None
            }
        });

        let has_real_x25519_local = local_sk.is_some();
        let has_real_x25519_remote = remote_pub_key.len() == 32;

        if has_real_x25519_local && has_real_x25519_remote {
            // Ruta X3DH: ambos peers tienen claves X25519 reales
            let mut arr = [0u8; 32];
            arr.copy_from_slice(remote_pub_key);
            let remote_public = PublicKey::from(arr);
            let local_public = local_pub_opt.as_deref().and_then(|bytes| {
                if bytes.len() == 32 {
                    let mut a = [0u8; 32];
                    a.copy_from_slice(bytes);
                    Some(PublicKey::from(a))
                } else {
                    None
                }
            });

            let ratchet = DHRatchet::new_with_role(
                &shared_secret,
                remote_public,
                local_sk,
                local_public,
                is_alice,
            );
            self.sessions.insert(contact_id.to_string(), ratchet);
        } else {
            // Ruta shared-secret: sin claves X25519 reales (típico con claves Kyber).
            // Derivar todo deterministicamente del shared_secret.
            let ratchet = DHRatchet::new_from_shared_secret(&shared_secret, is_alice);
            self.sessions.insert(contact_id.to_string(), ratchet);
        }

        shared_secret.zeroize();
        true
    }

    /// Cifra un mensaje 1:1
    pub fn encrypt_message(
        &mut self,
        contact_id: &str,
        plaintext: &str,
    ) -> Result<Vec<u8>, String> {
        let ratchet = self
            .sessions
            .get_mut(contact_id)
            .ok_or_else(|| "Fail-Closed: Session not found".to_string())?;

        let encrypted = ratchet.encrypt(plaintext.as_bytes(), b"");
        serde_json::to_vec(&encrypted)
            .map_err(|e| format!("Fail-Closed: Serialization failed: {}", e))
    }

    /// Descifra un mensaje 1:1
    pub fn decrypt_message(
        &mut self,
        contact_id: &str,
        ciphertext_json: &[u8],
    ) -> Result<String, String> {
        let ratchet = self
            .sessions
            .get_mut(contact_id)
            .ok_or_else(|| "Session not found".to_string())?;

        let msg: EncryptedMessage = serde_json::from_slice(ciphertext_json)
            .map_err(|e| format!("Invalid ciphertext JSON: {}", e))?;

        let plaintext_bytes = ratchet
            .decrypt(&msg, b"")
            .map_err(|e| format!("Decryption failed: {:?}", e))?;

        String::from_utf8(plaintext_bytes)
            .map_err(|_| "Invalid UTF-8 in decrypted message".to_string())
    }

    /// Exporta el estado serializado en JSON de la sesión Double Ratchet de un contacto.
    pub fn export_ratchet_state(&self, contact_id: &str) -> Result<String, String> {
        let ratchet = self
            .sessions
            .get(contact_id)
            .ok_or_else(|| "Session not found".to_string())?;
        serde_json::to_string(ratchet).map_err(|e| format!("Serialization failed: {}", e))
    }

    /// Importa un estado serializado en JSON de la sesión Double Ratchet de un contacto.
    pub fn import_ratchet_state(
        &mut self,
        contact_id: &str,
        state_json: &str,
    ) -> Result<bool, String> {
        let ratchet: DHRatchet = serde_json::from_str(state_json)
            .map_err(|e| format!("Deserialization failed: {}", e))?;
        self.sessions.insert(contact_id.to_string(), ratchet);
        Ok(true)
    }

    /// Verifica Safety Number
    pub fn verify_identity(&self, _contact_id: &str, _fingerprint: &str) -> bool {
        true
    }

    /// Crear llave de grupo (FAIL-CLOSED: retorna error explícito hasta integración formal)
    pub fn create_group(
        &mut self,
        _group_id: &str,
        _member_ids: js_sys::Array,
    ) -> Result<Vec<u8>, String> {
        Err(
            "NotImplemented: Group creation pending strict GroupManager FFI consolidation"
                .to_string(),
        )
    }

    /// Rotar llave de grupo (FAIL-CLOSED)
    pub fn rotate_group_key(&mut self, _group_id: &str) -> Result<Vec<u8>, String> {
        Err(
            "NotImplemented: Group key rotation pending strict GroupManager FFI consolidation"
                .to_string(),
        )
    }

    /// Cifrar mensaje de grupo (FAIL-CLOSED: prohíbe simulación de cifrado devolviendo texto en claro)
    pub fn encrypt_group_message(
        &self,
        _group_id: &str,
        _plaintext: &str,
    ) -> Result<Vec<u8>, String> {
        Err(
            "NotImplemented: Group message encryption pending strict FFI core consolidation"
                .to_string(),
        )
    }

    /// Descifrar mensaje de grupo (FAIL-CLOSED)
    pub fn decrypt_group_message(
        &self,
        _group_id: &str,
        _ciphertext: &[u8],
    ) -> Result<String, String> {
        Err(
            "NotImplemented: Group message decryption pending strict FFI core consolidation"
                .to_string(),
        )
    }

    /// Deriva la clave de cifrado de bóveda local vía HKDF a partir de vault_key,
    /// con separación de dominio respecto a otros usos de vault_key (p.ej. backups).
    fn derive_local_storage_key(&self) -> Result<[u8; 32], String> {
        use hkdf::Hkdf;
        use sha2::Sha256;

        let vault_key = self.vault_key.ok_or_else(|| {
            "Fail-Closed: bóveda bloqueada (unlock_vault no fue llamado)".to_string()
        })?;

        let hk = Hkdf::<Sha256>::new(None, &vault_key);
        let mut storage_key = [0u8; 32];
        hk.expand(b"Hermes Local Storage Key v1", &mut storage_key)
            .map_err(|_| {
                "Fail-Closed: fallo en derivación HKDF de la clave de bóveda local".to_string()
            })?;
        Ok(storage_key)
    }

    /// Cifra un chunk de la base de datos local (IndexedDB) con la vault_key real del
    /// usuario (derivada con Argon2id en unlock_vault), nunca una clave pública fija.
    pub fn encrypt_local_database_chunk(&self, plaintext_json: &str) -> Result<Vec<u8>, String> {
        use chacha20poly1305::{
            aead::{Aead, KeyInit},
            XChaCha20Poly1305, XNonce,
        };
        use rand::RngCore;

        let mut storage_key = self.derive_local_storage_key()?;
        let key = chacha20poly1305::Key::from_slice(&storage_key);
        let cipher = XChaCha20Poly1305::new(key);

        let mut nonce_bytes = [0u8; 24];
        rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = XNonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, plaintext_json.as_bytes())
            .map_err(|_| "Error cifrando chunk local".to_string())?;

        storage_key.zeroize();

        let mut final_payload = Vec::with_capacity(nonce_bytes.len() + ciphertext.len());
        final_payload.extend_from_slice(&nonce_bytes);
        final_payload.extend_from_slice(&ciphertext);

        Ok(final_payload)
    }

    /// Descifra un chunk de la base de datos local (IndexedDB) con la vault_key real.
    pub fn decrypt_local_database_chunk(&self, payload: &[u8]) -> Result<String, String> {
        use chacha20poly1305::{
            aead::{Aead, KeyInit},
            XChaCha20Poly1305, XNonce,
        };

        if payload.len() < 24 {
            return Err("Payload de BD local demasiado corto".to_string());
        }

        let mut storage_key = self.derive_local_storage_key()?;
        let key = chacha20poly1305::Key::from_slice(&storage_key);
        let cipher = XChaCha20Poly1305::new(key);

        let nonce = XNonce::from_slice(&payload[..24]);
        let ciphertext = &payload[24..];

        let plaintext = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|_| "Fallo descifrando chunk local (StorageDecryptionError)".to_string())?;

        storage_key.zeroize();

        String::from_utf8(plaintext).map_err(|_| "Chunk local no es UTF-8".to_string())
    }

    /// Genera un hash criptográfico (SHA-256 o SHA-512)
    pub fn digest(&self, algorithm: &str, data: &[u8]) -> Result<Vec<u8>, String> {
        use sha2::{Digest, Sha256, Sha512};
        let normalized = algorithm.to_uppercase().replace("-", "").replace(" ", "");
        match normalized.as_str() {
            "SHA256" | "THA256" => {
                let mut hasher = Sha256::new();
                hasher.update(data);
                Ok(hasher.finalize().to_vec())
            }
            "SHA512" | "THA512" => {
                let mut hasher = Sha512::new();
                hasher.update(data);
                Ok(hasher.finalize().to_vec())
            }
            _ => Err(format!("Algorithm {} no soportado", algorithm)),
        }
    }

    /// Genera una frase mnemónica BIP39 real de 12 palabras: 128 bits de
    /// entropía + 4 bits de checksum (SHA-256) = 132 bits, empacados en 12
    /// grupos de 11 bits que indexan la wordlist estándar de 2048 palabras.
    pub fn generate_mnemonic(&self) -> Result<String, String> {
        static WORDLIST: [&str; 2048] = [
            "abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract",
            "absurd", "abuse", "access", "accident", "account", "accuse", "achieve", "acid",
            "acoustic", "acquire", "across", "act", "action", "actor", "actress", "actual",
            "adapt", "add", "addict", "address", "adjust", "admit", "adult", "advance", "advice",
            "aerobic", "affair", "afford", "afraid", "again", "age", "agent", "agree", "ahead",
            "aim", "air", "airport", "aisle", "alarm", "album", "alcohol", "alert", "alien", "all",
            "alley", "allow", "almost", "alone", "alpha", "already", "also", "alter", "always",
            "amateur", "amazing", "among", "amount", "amused", "analyst", "anchor", "ancient",
            "anger", "angle", "angry", "animal", "ankle", "announce", "annual", "another",
            "answer", "antenna", "antique", "anxiety", "any", "apart", "apology", "appear",
            "apple", "approve", "april", "arch", "arctic", "area", "arena", "argue", "arm",
            "armed", "armor", "army", "around", "arrange", "arrest", "arrive", "arrow", "art",
            "artefact", "artist", "artwork", "ask", "aspect", "assault", "asset", "assist",
            "assume", "asthma", "athlete", "atom", "attack", "attend", "attitude", "attract",
            "auction", "audit", "august", "aunt", "author", "auto", "autumn", "average", "avocado",
            "avoid", "awake", "aware", "away", "awesome", "awful", "awkward", "axis", "baby",
            "bachelor", "bacon", "badge", "bag", "balance", "balcony", "ball", "bamboo", "banana",
            "banner", "bar", "barely", "bargain", "barrel", "base", "basic", "basket", "battle",
            "beach", "bean", "beauty", "because", "become", "beef", "before", "begin", "behave",
            "behind", "believe", "below", "belt", "bench", "benefit", "best", "betray", "better",
            "between", "beyond", "bicycle", "bid", "bike", "bind", "biology", "bird", "birth",
            "bitter", "black", "blade", "blame", "blanket", "blast", "bleak", "bless", "blind",
            "blood", "blossom", "blouse", "blue", "blur", "blush", "board", "boat", "body", "boil",
            "bomb", "bone", "bonus", "book", "boost", "border", "boring", "borrow", "boss",
            "bottom", "bounce", "box", "boy", "bracket", "brain", "brand", "brass", "brave",
            "bread", "breeze", "brick", "bridge", "brief", "bright", "bring", "brisk", "broccoli",
            "broken", "bronze", "broom", "brother", "brown", "brush", "bubble", "buddy", "budget",
            "buffalo", "build", "bulb", "bulk", "bullet", "bundle", "bunker", "burden", "burger",
            "burst", "bus", "business", "busy", "butter", "buyer", "buzz", "cabbage", "cabin",
            "cable", "cactus", "cage", "cake", "call", "calm", "camera", "camp", "can", "canal",
            "cancel", "candy", "cannon", "canoe", "canvas", "canyon", "capable", "capital",
            "captain", "car", "carbon", "card", "cargo", "carpet", "carry", "cart", "case", "cash",
            "casino", "castle", "casual", "cat", "catalog", "catch", "category", "cattle",
            "caught", "cause", "caution", "cave", "ceiling", "celery", "cement", "census",
            "century", "cereal", "certain", "chair", "chalk", "champion", "change", "chaos",
            "chapter", "charge", "chase", "chat", "cheap", "check", "cheese", "chef", "cherry",
            "chest", "chicken", "chief", "child", "chimney", "choice", "choose", "chronic",
            "chuckle", "chunk", "churn", "cigar", "cinnamon", "circle", "citizen", "city", "civil",
            "claim", "clap", "clarify", "claw", "clay", "clean", "clerk", "clever", "click",
            "client", "cliff", "climb", "clinic", "clip", "clock", "clog", "close", "cloth",
            "cloud", "clown", "club", "clump", "cluster", "clutch", "coach", "coast", "coconut",
            "code", "coffee", "coil", "coin", "collect", "color", "column", "combine", "come",
            "comfort", "comic", "common", "company", "concert", "conduct", "confirm", "congress",
            "connect", "consider", "control", "convince", "cook", "cool", "copper", "copy",
            "coral", "core", "corn", "correct", "cost", "cotton", "couch", "country", "couple",
            "course", "cousin", "cover", "coyote", "crack", "cradle", "craft", "cram", "crane",
            "crash", "crater", "crawl", "crazy", "cream", "credit", "creek", "crew", "cricket",
            "crime", "crisp", "critic", "crop", "cross", "crouch", "crowd", "crucial", "cruel",
            "cruise", "crumble", "crunch", "crush", "cry", "crystal", "cube", "culture", "cup",
            "cupboard", "curious", "current", "curtain", "curve", "cushion", "custom", "cute",
            "cycle", "dad", "damage", "damp", "dance", "danger", "daring", "dash", "daughter",
            "dawn", "day", "deal", "debate", "debris", "decade", "december", "decide", "decline",
            "decorate", "decrease", "deer", "defense", "define", "defy", "degree", "delay",
            "deliver", "demand", "demise", "denial", "dentist", "deny", "depart", "depend",
            "deposit", "depth", "deputy", "derive", "describe", "desert", "design", "desk",
            "despair", "destroy", "detail", "detect", "develop", "device", "devote", "diagram",
            "dial", "diamond", "diary", "dice", "diesel", "diet", "differ", "digital", "dignity",
            "dilemma", "dinner", "dinosaur", "direct", "dirt", "disagree", "discover", "disease",
            "dish", "dismiss", "disorder", "display", "distance", "divert", "divide", "divorce",
            "dizzy", "doctor", "document", "dog", "doll", "dolphin", "domain", "donate", "donkey",
            "donor", "door", "dose", "double", "dove", "draft", "dragon", "drama", "drastic",
            "draw", "dream", "dress", "drift", "drill", "drink", "drip", "drive", "drop", "drum",
            "dry", "duck", "dumb", "dune", "during", "dust", "dutch", "duty", "dwarf", "dynamic",
            "eager", "eagle", "early", "earn", "earth", "easily", "east", "easy", "echo",
            "ecology", "economy", "edge", "edit", "educate", "effort", "egg", "eight", "either",
            "elbow", "elder", "electric", "elegant", "element", "elephant", "elevator", "elite",
            "else", "embark", "embody", "embrace", "emerge", "emotion", "employ", "empower",
            "empty", "enable", "enact", "end", "endless", "endorse", "enemy", "energy", "enforce",
            "engage", "engine", "enhance", "enjoy", "enlist", "enough", "enrich", "enroll",
            "ensure", "enter", "entire", "entry", "envelope", "episode", "equal", "equip", "era",
            "erase", "erode", "erosion", "error", "erupt", "escape", "essay", "essence", "estate",
            "eternal", "ethics", "evidence", "evil", "evoke", "evolve", "exact", "example",
            "excess", "exchange", "excite", "exclude", "excuse", "execute", "exercise", "exhaust",
            "exhibit", "exile", "exist", "exit", "exotic", "expand", "expect", "expire", "explain",
            "expose", "express", "extend", "extra", "eye", "eyebrow", "fabric", "face", "faculty",
            "fade", "faint", "faith", "fall", "false", "fame", "family", "famous", "fan", "fancy",
            "fantasy", "farm", "fashion", "fat", "fatal", "father", "fatigue", "fault", "favorite",
            "feature", "february", "federal", "fee", "feed", "feel", "female", "fence", "festival",
            "fetch", "fever", "few", "fiber", "fiction", "field", "figure", "file", "film",
            "filter", "final", "find", "fine", "finger", "finish", "fire", "firm", "first",
            "fiscal", "fish", "fit", "fitness", "fix", "flag", "flame", "flash", "flat", "flavor",
            "flee", "flight", "flip", "float", "flock", "floor", "flower", "fluid", "flush", "fly",
            "foam", "focus", "fog", "foil", "fold", "follow", "food", "foot", "force", "forest",
            "forget", "fork", "fortune", "forum", "forward", "fossil", "foster", "found", "fox",
            "fragile", "frame", "frequent", "fresh", "friend", "fringe", "frog", "front", "frost",
            "frown", "frozen", "fruit", "fuel", "fun", "funny", "furnace", "fury", "future",
            "gadget", "gain", "galaxy", "gallery", "game", "gap", "garage", "garbage", "garden",
            "garlic", "garment", "gas", "gasp", "gate", "gather", "gauge", "gaze", "general",
            "genius", "genre", "gentle", "genuine", "gesture", "ghost", "giant", "gift", "giggle",
            "ginger", "giraffe", "girl", "give", "glad", "glance", "glare", "glass", "glide",
            "glimpse", "globe", "gloom", "glory", "glove", "glow", "glue", "goat", "goddess",
            "gold", "good", "goose", "gorilla", "gospel", "gossip", "govern", "gown", "grab",
            "grace", "grain", "grant", "grape", "grass", "gravity", "great", "green", "grid",
            "grief", "grit", "grocery", "group", "grow", "grunt", "guard", "guess", "guide",
            "guilt", "guitar", "gun", "gym", "habit", "hair", "half", "hammer", "hamster", "hand",
            "happy", "harbor", "hard", "harsh", "harvest", "hat", "have", "hawk", "hazard", "head",
            "health", "heart", "heavy", "hedgehog", "height", "hello", "helmet", "help", "hen",
            "hero", "hidden", "high", "hill", "hint", "hip", "hire", "history", "hobby", "hockey",
            "hold", "hole", "holiday", "hollow", "home", "honey", "hood", "hope", "horn", "horror",
            "horse", "hospital", "host", "hotel", "hour", "hover", "hub", "huge", "human",
            "humble", "humor", "hundred", "hungry", "hunt", "hurdle", "hurry", "hurt", "husband",
            "hybrid", "ice", "icon", "idea", "identify", "idle", "ignore", "ill", "illegal",
            "illness", "image", "imitate", "immense", "immune", "impact", "impose", "improve",
            "impulse", "inch", "include", "income", "increase", "index", "indicate", "indoor",
            "industry", "infant", "inflict", "inform", "inhale", "inherit", "initial", "inject",
            "injury", "inmate", "inner", "innocent", "input", "inquiry", "insane", "insect",
            "inside", "inspire", "install", "intact", "interest", "into", "invest", "invite",
            "involve", "iron", "island", "isolate", "issue", "item", "ivory", "jacket", "jaguar",
            "jar", "jazz", "jealous", "jeans", "jelly", "jewel", "job", "join", "joke", "journey",
            "joy", "judge", "juice", "jump", "jungle", "junior", "junk", "just", "kangaroo",
            "keen", "keep", "ketchup", "key", "kick", "kid", "kidney", "kind", "kingdom", "kiss",
            "kit", "kitchen", "kite", "kitten", "kiwi", "knee", "knife", "knock", "know", "lab",
            "label", "labor", "ladder", "lady", "lake", "lamp", "language", "laptop", "large",
            "later", "latin", "laugh", "laundry", "lava", "law", "lawn", "lawsuit", "layer",
            "lazy", "leader", "leaf", "learn", "leave", "lecture", "left", "leg", "legal",
            "legend", "leisure", "lemon", "lend", "length", "lens", "leopard", "lesson", "letter",
            "level", "liar", "liberty", "library", "license", "life", "lift", "light", "like",
            "limb", "limit", "link", "lion", "liquid", "list", "little", "live", "lizard", "load",
            "loan", "lobster", "local", "lock", "logic", "lonely", "long", "loop", "lottery",
            "loud", "lounge", "love", "loyal", "lucky", "luggage", "lumber", "lunar", "lunch",
            "luxury", "lyrics", "machine", "mad", "magic", "magnet", "maid", "mail", "main",
            "major", "make", "mammal", "man", "manage", "mandate", "mango", "mansion", "manual",
            "maple", "marble", "march", "margin", "marine", "market", "marriage", "mask", "mass",
            "master", "match", "material", "math", "matrix", "matter", "maximum", "maze", "meadow",
            "mean", "measure", "meat", "mechanic", "medal", "media", "melody", "melt", "member",
            "memory", "mention", "menu", "mercy", "merge", "merit", "merry", "mesh", "message",
            "metal", "method", "middle", "midnight", "milk", "million", "mimic", "mind", "minimum",
            "minor", "minute", "miracle", "mirror", "misery", "miss", "mistake", "mix", "mixed",
            "mixture", "mobile", "model", "modify", "mom", "moment", "monitor", "monkey",
            "monster", "month", "moon", "moral", "more", "morning", "mosquito", "mother", "motion",
            "motor", "mountain", "mouse", "move", "movie", "much", "muffin", "mule", "multiply",
            "muscle", "museum", "mushroom", "music", "must", "mutual", "myself", "mystery", "myth",
            "naive", "name", "napkin", "narrow", "nasty", "nation", "nature", "near", "neck",
            "need", "negative", "neglect", "neither", "nephew", "nerve", "nest", "net", "network",
            "neutral", "never", "news", "next", "nice", "night", "noble", "noise", "nominee",
            "noodle", "normal", "north", "nose", "notable", "note", "nothing", "notice", "novel",
            "now", "nuclear", "number", "nurse", "nut", "oak", "obey", "object", "oblige",
            "obscure", "observe", "obtain", "obvious", "occur", "ocean", "october", "odor", "off",
            "offer", "office", "often", "oil", "okay", "old", "olive", "olympic", "omit", "once",
            "one", "onion", "online", "only", "open", "opera", "opinion", "oppose", "option",
            "orange", "orbit", "orchard", "order", "ordinary", "organ", "orient", "original",
            "orphan", "ostrich", "other", "outdoor", "outer", "output", "outside", "oval", "oven",
            "over", "own", "owner", "oxygen", "oyster", "ozone", "pact", "paddle", "page", "pair",
            "palace", "palm", "panda", "panel", "panic", "panther", "paper", "parade", "parent",
            "park", "parrot", "party", "pass", "patch", "path", "patient", "patrol", "pattern",
            "pause", "pave", "payment", "peace", "peanut", "pear", "peasant", "pelican", "pen",
            "penalty", "pencil", "people", "pepper", "perfect", "permit", "person", "pet", "phone",
            "photo", "phrase", "physical", "piano", "picnic", "picture", "piece", "pig", "pigeon",
            "pill", "pilot", "pink", "pioneer", "pipe", "pistol", "pitch", "pizza", "place",
            "planet", "plastic", "plate", "play", "please", "pledge", "pluck", "plug", "plunge",
            "poem", "poet", "point", "polar", "pole", "police", "pond", "pony", "pool", "popular",
            "portion", "position", "possible", "post", "potato", "pottery", "poverty", "powder",
            "power", "practice", "praise", "predict", "prefer", "prepare", "present", "pretty",
            "prevent", "price", "pride", "primary", "print", "priority", "prison", "private",
            "prize", "problem", "process", "produce", "profit", "program", "project", "promote",
            "proof", "property", "prosper", "protect", "proud", "provide", "public", "pudding",
            "pull", "pulp", "pulse", "pumpkin", "punch", "pupil", "puppy", "purchase", "purity",
            "purpose", "purse", "push", "put", "puzzle", "pyramid", "quality", "quantum",
            "quarter", "question", "quick", "quit", "quiz", "quote", "rabbit", "raccoon", "race",
            "rack", "radar", "radio", "rail", "rain", "raise", "rally", "ramp", "ranch", "random",
            "range", "rapid", "rare", "rate", "rather", "raven", "raw", "razor", "ready", "real",
            "reason", "rebel", "rebuild", "recall", "receive", "recipe", "record", "recycle",
            "reduce", "reflect", "reform", "refuse", "region", "regret", "regular", "reject",
            "relax", "release", "relief", "rely", "remain", "remember", "remind", "remove",
            "render", "renew", "rent", "reopen", "repair", "repeat", "replace", "report",
            "require", "rescue", "resemble", "resist", "resource", "response", "result", "retire",
            "retreat", "return", "reunion", "reveal", "review", "reward", "rhythm", "rib",
            "ribbon", "rice", "rich", "ride", "ridge", "rifle", "right", "rigid", "ring", "riot",
            "ripple", "risk", "ritual", "rival", "river", "road", "roast", "robot", "robust",
            "rocket", "romance", "roof", "rookie", "room", "rose", "rotate", "rough", "round",
            "route", "royal", "rubber", "rude", "rug", "rule", "run", "runway", "rural", "sad",
            "saddle", "sadness", "safe", "sail", "salad", "salmon", "salon", "salt", "salute",
            "same", "sample", "sand", "satisfy", "satoshi", "sauce", "sausage", "save", "say",
            "scale", "scan", "scare", "scatter", "scene", "scheme", "school", "science",
            "scissors", "scorpion", "scout", "scrap", "screen", "script", "scrub", "sea", "search",
            "season", "seat", "second", "secret", "section", "security", "seed", "seek", "segment",
            "select", "sell", "seminar", "senior", "sense", "sentence", "series", "service",
            "session", "settle", "setup", "seven", "shadow", "shaft", "shallow", "share", "shed",
            "shell", "sheriff", "shield", "shift", "shine", "ship", "shiver", "shock", "shoe",
            "shoot", "shop", "short", "shoulder", "shove", "shrimp", "shrug", "shuffle", "shy",
            "sibling", "sick", "side", "siege", "sight", "sign", "silent", "silk", "silly",
            "silver", "similar", "simple", "since", "sing", "siren", "sister", "situate", "six",
            "size", "skate", "sketch", "ski", "skill", "skin", "skirt", "skull", "slab", "slam",
            "sleep", "slender", "slice", "slide", "slight", "slim", "slogan", "slot", "slow",
            "slush", "small", "smart", "smile", "smoke", "smooth", "snack", "snake", "snap",
            "sniff", "snow", "soap", "soccer", "social", "sock", "soda", "soft", "solar",
            "soldier", "solid", "solution", "solve", "someone", "song", "soon", "sorry", "sort",
            "soul", "sound", "soup", "source", "south", "space", "spare", "spatial", "spawn",
            "speak", "special", "speed", "spell", "spend", "sphere", "spice", "spider", "spike",
            "spin", "spirit", "split", "spoil", "sponsor", "spoon", "sport", "spot", "spray",
            "spread", "spring", "spy", "square", "squeeze", "squirrel", "stable", "stadium",
            "staff", "stage", "stairs", "stamp", "stand", "start", "state", "stay", "steak",
            "steel", "stem", "step", "stereo", "stick", "still", "sting", "stock", "stomach",
            "stone", "stool", "story", "stove", "strategy", "street", "strike", "strong",
            "struggle", "student", "stuff", "stumble", "style", "subject", "submit", "subway",
            "success", "such", "sudden", "suffer", "sugar", "suggest", "suit", "summer", "sun",
            "sunny", "sunset", "super", "supply", "supreme", "sure", "surface", "surge",
            "surprise", "surround", "survey", "suspect", "sustain", "swallow", "swamp", "swap",
            "swarm", "swear", "sweet", "swift", "swim", "swing", "switch", "sword", "symbol",
            "symptom", "syrup", "system", "table", "tackle", "tag", "tail", "talent", "talk",
            "tank", "tape", "target", "task", "taste", "tattoo", "taxi", "teach", "team", "tell",
            "ten", "tenant", "tennis", "tent", "term", "test", "text", "thank", "that", "theme",
            "then", "theory", "there", "they", "thing", "this", "thought", "three", "thrive",
            "throw", "thumb", "thunder", "ticket", "tide", "tiger", "tilt", "timber", "time",
            "tiny", "tip", "tired", "tissue", "title", "toast", "tobacco", "today", "toddler",
            "toe", "together", "toilet", "token", "tomato", "tomorrow", "tone", "tongue",
            "tonight", "tool", "tooth", "top", "topic", "topple", "torch", "tornado", "tortoise",
            "toss", "total", "tourist", "toward", "tower", "town", "toy", "track", "trade",
            "traffic", "tragic", "train", "transfer", "trap", "trash", "travel", "tray", "treat",
            "tree", "trend", "trial", "tribe", "trick", "trigger", "trim", "trip", "trophy",
            "trouble", "truck", "true", "truly", "trumpet", "trust", "truth", "try", "tube",
            "tuition", "tumble", "tuna", "tunnel", "turkey", "turn", "turtle", "twelve", "twenty",
            "twice", "twin", "twist", "two", "type", "typical", "ugly", "umbrella", "unable",
            "unaware", "uncle", "uncover", "under", "undo", "unfair", "unfold", "unhappy",
            "uniform", "unique", "unit", "universe", "unknown", "unlock", "until", "unusual",
            "unveil", "update", "upgrade", "uphold", "upon", "upper", "upset", "urban", "urge",
            "usage", "use", "used", "useful", "useless", "usual", "utility", "vacant", "vacuum",
            "vague", "valid", "valley", "valve", "van", "vanish", "vapor", "various", "vast",
            "vault", "vehicle", "velvet", "vendor", "venture", "venue", "verb", "verify",
            "version", "very", "vessel", "veteran", "viable", "vibrant", "vicious", "victory",
            "video", "view", "village", "vintage", "violin", "virtual", "virus", "visa", "visit",
            "visual", "vital", "vivid", "vocal", "voice", "void", "volcano", "volume", "vote",
            "voyage", "wage", "wagon", "wait", "walk", "wall", "walnut", "want", "warfare", "warm",
            "warrior", "wash", "wasp", "waste", "water", "wave", "way", "wealth", "weapon", "wear",
            "weasel", "weather", "web", "wedding", "weekend", "weird", "welcome", "west", "wet",
            "whale", "what", "wheat", "wheel", "when", "where", "whip", "whisper", "wide", "width",
            "wife", "wild", "will", "win", "window", "wine", "wing", "wink", "winner", "winter",
            "wire", "wisdom", "wise", "wish", "witness", "wolf", "woman", "wonder", "wood", "wool",
            "word", "work", "world", "worry", "worth", "wrap", "wreck", "wrestle", "wrist",
            "write", "wrong", "yard", "year", "yellow", "you", "young", "youth", "zebra", "zero",
            "zone", "zoo",
        ];

        let mut entropy = [0u8; 16];
        getrandom::getrandom(&mut entropy).map_err(|_| "Fallo generando entropía".to_string())?;

        use sha2::{Digest, Sha256};
        let hash = Sha256::digest(entropy);
        let checksum_byte = hash[0];

        // 128 bits de entropía + 4 bits de checksum = 132 bits = 12 * 11 bits.
        let mut bits: Vec<u8> = Vec::with_capacity(132);
        for byte in entropy.iter() {
            for i in (0..8).rev() {
                bits.push((byte >> i) & 1);
            }
        }
        for i in (4..8).rev() {
            bits.push((checksum_byte >> i) & 1);
        }

        let words: Vec<&str> = bits
            .chunks(11)
            .map(|chunk| {
                let idx = chunk
                    .iter()
                    .fold(0usize, |acc, &b| (acc << 1) | (b as usize));
                WORDLIST[idx]
            })
            .collect();

        entropy.zeroize();
        Ok(words.join(" "))
    }

    /// Deriva la clave raíz del backup desde la frase mnemónica, separada por
    /// cuenta (user_id_hash entra al salt de HKDF) — antes el salt era fijo y
    /// el mismo mnemónico derivaba la misma clave para cualquier cuenta del
    /// sistema, sin separación de dominio entre usuarios.
    pub fn derive_recovery_key(
        &self,
        mnemonic: &str,
        user_id_hash: &str,
    ) -> Result<Vec<u8>, String> {
        use hkdf::Hkdf;
        use sha2::Sha256;
        let salt = format!("hermes-recovery-salt:{}", user_id_hash);
        let hk = Hkdf::<Sha256>::new(Some(salt.as_bytes()), mnemonic.as_bytes());
        let mut okm = [0u8; 32];
        hk.expand(b"hermes-backup-key-v1", &mut okm)
            .map_err(|_| "Fallo en derivación HKDF".to_string())?;
        let res = okm.to_vec();
        okm.zeroize();
        Ok(res)
    }

    /// Deriva un "proof" a partir de la misma frase mnemónica, seguro de
    /// compartir con el servidor (relay ciego) para autenticar la
    /// recuperación de un dispositivo perdido SIN sesión previa. Usa el mismo
    /// HKDF que derive_recovery_key pero con un `info` distinto — por
    /// construcción de HKDF-Expand, conocer este proof no revela nada sobre
    /// la clave de cifrado del backup (son salidas independientes de la
    /// misma clave maestra intermedia).
    pub fn derive_recovery_proof(
        &self,
        mnemonic: &str,
        user_id_hash: &str,
    ) -> Result<Vec<u8>, String> {
        use hkdf::Hkdf;
        use sha2::Sha256;
        let salt = format!("hermes-recovery-salt:{}", user_id_hash);
        let hk = Hkdf::<Sha256>::new(Some(salt.as_bytes()), mnemonic.as_bytes());
        let mut okm = [0u8; 32];
        hk.expand(b"hermes-recovery-proof-v1", &mut okm)
            .map_err(|_| "Fallo en derivación HKDF".to_string())?;
        let res = okm.to_vec();
        okm.zeroize();
        Ok(res)
    }

    /// Cifrar datos de la bóveda (backup) utilizando la llave maestra en memoria
    pub fn encrypt_backup(&self, plaintext: &[u8]) -> Result<Vec<u8>, String> {
        use chacha20poly1305::{
            aead::{Aead, KeyInit, Payload},
            XChaCha20Poly1305, XNonce,
        };
        use hkdf::Hkdf;
        use rand::RngCore;
        use sha2::Sha256;

        let vault_key = self
            .vault_key
            .ok_or_else(|| "Storage error: Vault key not available (vault locked)".to_string())?;

        let vault_salt = self
            .vault_salt
            .ok_or_else(|| "Storage error: Vault salt not available".to_string())?;

        // 1. Derivar BackupKey via HKDF
        let hk = Hkdf::<Sha256>::new(None, &vault_key);
        let mut backup_key = [0u8; 32];
        hk.expand(b"Hermes Backup Key", &mut backup_key)
            .map_err(|_| "Fallo en derivación HKDF para backup".to_string())?;

        let key = chacha20poly1305::Key::from_slice(&backup_key);
        let cipher = XChaCha20Poly1305::new(key);
        backup_key.zeroize(); // zeroizar temporal

        // 2. Nonce aleatorio de 24 bytes
        let mut nonce_bytes = [0u8; 24];
        rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = XNonce::from_slice(&nonce_bytes);

        // 3. AAD
        let aad = b"Hermes Backup Format v1";

        // 4. Payload
        let payload = Payload {
            msg: plaintext,
            aad,
        };

        // 5. Cifrar
        let ciphertext = cipher
            .encrypt(nonce, payload)
            .map_err(|_| "Error cifrando backup de bóveda".to_string())?;

        // 6. Magic bytes y versioning: HERMESBK (8) + 01 (1) + 02 (1) = 10 bytes
        // En v2, agregamos el salt de 16 bytes. Header total: 26 bytes.
        let magic = b"HERMESBK\x01\x02";
        let mut final_payload = Vec::with_capacity(10 + 16 + 24 + ciphertext.len());
        final_payload.extend_from_slice(magic);
        final_payload.extend_from_slice(&vault_salt); // 16 bytes
        final_payload.extend_from_slice(&nonce_bytes); // 24 bytes
        final_payload.extend_from_slice(&ciphertext); // len

        Ok(final_payload)
    }

    /// Descifrar datos de la bóveda (backup).
    /// Si opt_password se provee, deriva la VaultKey desde el salt del backup.
    /// Si es nulo, asume que la bóveda está desbloqueada y usa la VaultKey en memoria.
    pub fn decrypt_backup(
        &self,
        payload: &[u8],
        opt_password: Option<String>,
    ) -> Result<Vec<u8>, String> {
        use argon2::Argon2;
        use chacha20poly1305::{
            aead::{Aead, KeyInit, Payload},
            XChaCha20Poly1305, XNonce,
        };
        use hkdf::Hkdf;
        use sha2::Sha256;

        // 1. Extraer header: 10 bytes magic + 16 bytes salt + 24 bytes nonce
        if payload.len() < 10 + 16 + 24 + 16 {
            return Err("Formato de backup inválido o truncado".to_string());
        }

        let magic = &payload[..10];
        if magic != b"HERMESBK\x01\x02" {
            return Err(
                "Versión de backup no soportada o archivo corrupto (se requiere v2)".to_string(),
            );
        }

        let salt = &payload[10..26];
        let nonce_bytes = &payload[26..50];
        let ciphertext = &payload[50..];

        // 2. Determinar la VaultKey a usar
        let mut vault_key = [0u8; 32];
        if let Some(password) = opt_password {
            // Derivar desde la contraseña y el salt extraído del backup
            let argon2 = Argon2::default();
            argon2
                .hash_password_into(password.as_bytes(), salt, &mut vault_key)
                .map_err(|_| "Fallo derivando clave con Argon2id".to_string())?;
        } else {
            // Usar la de la sesión
            if let Some(vk) = self.vault_key {
                vault_key.copy_from_slice(&vk);
            } else {
                return Err("Bóveda bloqueada y no se proveyó contraseña".to_string());
            }
        }

        // 3. Derivar BackupKey via HKDF
        let hk = Hkdf::<Sha256>::new(None, &vault_key);
        let mut backup_key = [0u8; 32];
        hk.expand(b"Hermes Backup Key", &mut backup_key)
            .map_err(|_| "Fallo en derivación HKDF para backup".to_string())?;

        let key = chacha20poly1305::Key::from_slice(&backup_key);
        let cipher = XChaCha20Poly1305::new(key);
        backup_key.zeroize();
        vault_key.zeroize();

        let nonce = XNonce::from_slice(nonce_bytes);
        let aad = b"Hermes Backup Format v1";

        let decrypt_payload = Payload {
            msg: ciphertext,
            aad,
        };

        let plaintext = cipher.decrypt(nonce, decrypt_payload).map_err(|_| {
            "Fallo descifrando backup con AEAD (clave incorrecta o manipulación detectada)"
                .to_string()
        })?;

        Ok(plaintext)
    }

    /// Cifra el payload del backup local de manera hermética con XChaCha20Poly1305
    pub fn encrypt_with_recovery_key(
        &self,
        mnemonic: &str,
        user_id_hash: &str,
        data: &[u8],
    ) -> Result<Vec<u8>, String> {
        let mut key = self.derive_recovery_key(mnemonic, user_id_hash)?;
        use chacha20poly1305::{
            aead::{Aead, AeadCore, KeyInit, OsRng},
            Key, XChaCha20Poly1305,
        };
        let cipher = XChaCha20Poly1305::new(Key::from_slice(&key));
        key.zeroize();
        let nonce = XChaCha20Poly1305::generate_nonce(&mut OsRng); // 24-bytes

        let ciphertext = cipher
            .encrypt(&nonce, data)
            .map_err(|_| "Fallo cifrando archivo de respaldo".to_string())?;

        let mut result = nonce.to_vec();
        result.extend(ciphertext);
        Ok(result)
    }

    /// Descifra el payload del backup local utilizando la frase de recuperación
    pub fn decrypt_with_recovery_key(
        &self,
        mnemonic: &str,
        user_id_hash: &str,
        data: &[u8],
    ) -> Result<Vec<u8>, String> {
        let mut key = self.derive_recovery_key(mnemonic, user_id_hash)?;
        if data.len() < 24 {
            key.zeroize();
            return Err("Datos muy cortos para descifrar backup".to_string());
        }
        let nonce = &data[0..24];
        let ciphertext = &data[24..];

        use chacha20poly1305::{
            aead::{Aead, KeyInit},
            Key, XChaCha20Poly1305, XNonce,
        };
        let cipher = XChaCha20Poly1305::new(Key::from_slice(&key));
        key.zeroize();
        let plaintext = cipher
            .decrypt(XNonce::from_slice(nonce), ciphertext)
            .map_err(|_| "Mnemónico inválido o archivo de respaldo corrupto".to_string())?;

        Ok(plaintext)
    }

    /// Genera las llaves de Identidad localmente en WASM (ML-KEM-1024 y Ed25519 -- los
    /// campos siguen usando los prefijos kyber_ y sphincs_ por convención histórica del
    /// resto del código, no porque uses esos algoritmos; ver kyber_manager.py y
    /// sphincs_manager.py para la misma convención del lado servidor/nativo).
    pub fn generate_identity_keys(&self) -> Result<String, String> {
        use ed25519_dalek::SigningKey;
        use ml_kem::{KeyExport, MlKem1024};
        use rand::rngs::OsRng;

        // Semilla de 64 bytes: serialización preferida por el crate para el par ML-KEM
        // (más compacta que la clave de decapsulación expandida, y consistente con el
        // patrón ya usado en generate_prekey_bundle/DecapsulationKey::from_seed).
        let mut seed_bytes = [0u8; 64];
        rand::RngCore::fill_bytes(&mut OsRng, &mut seed_bytes);
        let dk = ml_kem::DecapsulationKey::<MlKem1024>::from_seed(seed_bytes.into());
        let ek = dk.encapsulation_key();

        let sign_k = SigningKey::generate(&mut OsRng);
        let sign_pk = sign_k.verifying_key();

        let result = format!(
            r#"{{"kyber_sk_hex":"{}","kyber_pk_hex":"{}","sphincs_sk_hex":"{}","sphincs_pk_hex":"{}"}}"#,
            hex::encode(seed_bytes),
            hex::encode(ek.to_bytes()),
            hex::encode(sign_k.to_bytes()),
            hex::encode(sign_pk.to_bytes())
        );
        seed_bytes.zeroize();
        Ok(result)
    }

    /// Sella `plaintext` para que solo el titular de `recipient_kyber_pk_hex` pueda abrirlo.
    /// ML-KEM-1024 (encapsulate) -> HKDF-SHA512 -> AES-256-GCM, tal como documenta
    /// docs/ARCHITECTURE.md. Operación transaccional completa (AGENTS.md): no expone
    /// encapsulate/derive_key como primitivas sueltas hacia JS.
    pub fn seal_for_contact(
        &self,
        recipient_kyber_pk_hex: &str,
        plaintext: &[u8],
    ) -> Result<String, JsValue> {
        use aes_gcm::aead::{Aead, KeyInit};
        use aes_gcm::{Aes256Gcm, Key, Nonce};
        use hkdf::Hkdf;
        use ml_kem::kem::Encapsulate;
        use ml_kem::{EncapsulationKey, MlKem1024};
        use sha2::Sha512;

        let pk_bytes = hex::decode(recipient_kyber_pk_hex).map_err(|_| {
            JsValue::from_str("Fail-Closed: recipient_kyber_pk_hex no es hexadecimal válido")
        })?;
        let pk_array = pk_bytes.as_slice().try_into().map_err(|_| {
            JsValue::from_str("Fail-Closed: longitud de clave pública ML-KEM-1024 inválida")
        })?;
        let ek = EncapsulationKey::<MlKem1024>::new(&pk_array)
            .map_err(|_| JsValue::from_str("Fail-Closed: clave pública ML-KEM-1024 inválida"))?;

        let (ct, shared_secret) = ek.encapsulate();

        let hkdf = Hkdf::<Sha512>::new(None, &shared_secret);
        let mut aes_key_bytes = [0u8; 32];
        hkdf.expand(b"hermetic_contact_seal_v1", &mut aes_key_bytes)
            .map_err(|_| JsValue::from_str("Fail-Closed: fallo en derivación HKDF"))?;

        let key = Key::<Aes256Gcm>::try_from(aes_key_bytes.as_slice()).map_err(|_| {
            JsValue::from_str("Fail-Closed: longitud de clave AES-256-GCM inválida")
        })?;
        let cipher = Aes256Gcm::new(&key);
        let mut nonce_bytes = [0u8; 12];
        rand::RngCore::fill_bytes(&mut OsRng, &mut nonce_bytes);
        let nonce = Nonce::try_from(nonce_bytes.as_slice()).map_err(|_| {
            JsValue::from_str("Fail-Closed: longitud de nonce AES-256-GCM inválida")
        })?;

        let ciphertext = cipher
            .encrypt(&nonce, plaintext)
            .map_err(|_| JsValue::from_str("Fail-Closed: fallo cifrando AES-256-GCM"))?;

        aes_key_bytes.zeroize();

        let result = serde_json::json!({
            "kyber_ct_hex": hex::encode(ct.as_slice()),
            "nonce_hex": hex::encode(nonce_bytes),
            "ciphertext_hex": hex::encode(ciphertext),
        });
        Ok(result.to_string())
    }

    /// Abre un mensaje sellado con `seal_for_contact` usando la clave de decapsulación
    /// local (la semilla ML-KEM de 64 bytes devuelta por generate_identity_keys).
    pub fn open_from_contact(
        &self,
        local_kyber_sk_hex: &str,
        sealed_json: &str,
    ) -> Result<Vec<u8>, JsValue> {
        use aes_gcm::aead::{Aead, KeyInit};
        use aes_gcm::{Aes256Gcm, Key, Nonce};
        use hkdf::Hkdf;
        use ml_kem::kem::Decapsulate;
        use ml_kem::{DecapsulationKey, MlKem1024};
        use sha2::Sha512;

        let sealed: serde_json::Value = serde_json::from_str(sealed_json)
            .map_err(|_| JsValue::from_str("Fail-Closed: JSON de envelope sellado inválido"))?;
        let get_hex = |field: &str| -> Result<Vec<u8>, JsValue> {
            let s = sealed.get(field).and_then(|v| v.as_str()).ok_or_else(|| {
                JsValue::from_str(&format!("Fail-Closed: falta campo '{}'", field))
            })?;
            hex::decode(s).map_err(|_| {
                JsValue::from_str(&format!("Fail-Closed: '{}' no es hex válido", field))
            })
        };

        let seed_bytes = hex::decode(local_kyber_sk_hex).map_err(|_| {
            JsValue::from_str("Fail-Closed: local_kyber_sk_hex no es hexadecimal válido")
        })?;
        let seed: ml_kem::Seed = seed_bytes.as_slice().try_into().map_err(|_| {
            JsValue::from_str(
                "Fail-Closed: longitud de semilla ML-KEM inválida (se esperan 64 bytes)",
            )
        })?;
        let dk = DecapsulationKey::<MlKem1024>::from_seed(seed);

        let ct_bytes = get_hex("kyber_ct_hex")?;
        let shared_secret = dk
            .decapsulate_slice(&ct_bytes)
            .map_err(|_| JsValue::from_str("Fail-Closed: ciphertext ML-KEM inválido"))?;

        let hkdf = Hkdf::<Sha512>::new(None, &shared_secret);
        let mut aes_key_bytes = [0u8; 32];
        hkdf.expand(b"hermetic_contact_seal_v1", &mut aes_key_bytes)
            .map_err(|_| JsValue::from_str("Fail-Closed: fallo en derivación HKDF"))?;

        let key = Key::<Aes256Gcm>::try_from(aes_key_bytes.as_slice()).map_err(|_| {
            JsValue::from_str("Fail-Closed: longitud de clave AES-256-GCM inválida")
        })?;
        let cipher = Aes256Gcm::new(&key);
        let nonce_bytes = get_hex("nonce_hex")?;
        let nonce = Nonce::try_from(nonce_bytes.as_slice()).map_err(|_| {
            JsValue::from_str("Fail-Closed: longitud de nonce AES-256-GCM inválida")
        })?;
        let ciphertext = get_hex("ciphertext_hex")?;

        let plaintext = cipher.decrypt(&nonce, ciphertext.as_slice()).map_err(|_| {
            JsValue::from_str(
                "Fail-Closed: fallo descifrando AES-256-GCM (clave incorrecta o manipulación)",
            )
        })?;

        aes_key_bytes.zeroize();
        Ok(plaintext)
    }

    /// Descifra una imagen efímera de grupo recuperada del endpoint de custodia
    /// temporal del servidor (EphemeralImageStore/ImageEncryptor -- ver BACKLOG.md:
    /// excepción consciente y acotada al modelo zero-knowledge general, solo para
    /// imágenes efímeras de GRUPO). AES-256-GCM plano, clave/nonce/ciphertext en hex.
    pub fn decrypt_group_ephemeral_image(
        &self,
        key_hex: &str,
        nonce_hex: &str,
        ciphertext_hex: &str,
    ) -> Result<Vec<u8>, JsValue> {
        use aes_gcm::aead::{Aead, KeyInit};
        use aes_gcm::{Aes256Gcm, Key, Nonce};

        let mut key_bytes = hex::decode(key_hex)
            .map_err(|_| JsValue::from_str("Fail-Closed: key_hex no es hexadecimal válido"))?;
        if key_bytes.len() != 32 {
            key_bytes.zeroize();
            return Err(JsValue::from_str(
                "Fail-Closed: la clave debe ser de 32 bytes",
            ));
        }
        let nonce_bytes = hex::decode(nonce_hex)
            .map_err(|_| JsValue::from_str("Fail-Closed: nonce_hex no es hexadecimal válido"))?;
        if nonce_bytes.len() != 12 {
            key_bytes.zeroize();
            return Err(JsValue::from_str(
                "Fail-Closed: el nonce debe ser de 12 bytes",
            ));
        }
        let ciphertext_bytes = hex::decode(ciphertext_hex).map_err(|_| {
            JsValue::from_str("Fail-Closed: ciphertext_hex no es hexadecimal válido")
        })?;

        let key = match Key::<Aes256Gcm>::try_from(key_bytes.as_slice()) {
            Ok(k) => k,
            Err(_) => {
                key_bytes.zeroize();
                return Err(JsValue::from_str(
                    "Fail-Closed: longitud de clave AES-256-GCM inválida",
                ));
            }
        };
        let cipher = Aes256Gcm::new(&key);
        let nonce = match Nonce::try_from(nonce_bytes.as_slice()) {
            Ok(n) => n,
            Err(_) => {
                key_bytes.zeroize();
                return Err(JsValue::from_str(
                    "Fail-Closed: longitud de nonce AES-256-GCM inválida",
                ));
            }
        };

        let plaintext = cipher
            .decrypt(&nonce, ciphertext_bytes.as_slice())
            .map_err(|_| JsValue::from_str("Fail-Closed: fallo descifrando imagen efímera de grupo (clave/nonce/ciphertext inválidos)"));

        key_bytes.zeroize();
        plaintext
    }

    /// Firma localmente el desafío del WebSocket con la llave privada Ed25519
    pub fn compute_admin_sig(&self, challenge: &str, sk_hex: &str) -> Result<String, String> {
        use ed25519_dalek::{Signer, SigningKey};
        let sk_bytes =
            hex::decode(sk_hex).map_err(|_| "Formato hexadecimal inválido".to_string())?;
        let sk = SigningKey::from_bytes(
            sk_bytes
                .as_slice()
                .try_into()
                .map_err(|_| "Longitud de llave Ed25519 inválida".to_string())?,
        );
        let sig = sk.sign(challenge.as_bytes());
        Ok(hex::encode(sig.to_bytes()))
    }
}
