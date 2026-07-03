use crate::ratchet::constants::*;
use crate::ratchet::state::{RatchetState, SkippedKey};
use hkdf::Hkdf;
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::Sha512;
use thiserror::Error;
use x25519_dalek::{PublicKey, StaticSecret};
use zeroize::Zeroize;

#[derive(Error, Debug, PartialEq)]
pub enum RatchetError {
    #[error("Invalid header")]
    InvalidHeader,
    #[error("Header decryption failed")]
    HeaderDecryptionFailed,
    #[error("Decryption failed")]
    DecryptionFailed,
    #[error("Message number too far ahead (max skip: {0})")]
    MessageTooFar(u32),
    #[error("Old or replayed message rejected")]
    OldMessageReplayed,
}

#[derive(Serialize, Deserialize)]
pub struct Header {
    pub dh_public: [u8; 32],
    pub pn: u32,
    pub n: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EncryptedMessage {
    pub header: Vec<u8>,
    pub ciphertext: Vec<u8>,
    pub nonce: [u8; 24],
    pub message_number: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EncryptedBody {
    pub ciphertext: Vec<u8>,
    pub nonce: [u8; 24],
}

/// Double Ratchet Engine
pub struct DHRatchet {
    pub state: RatchetState,
}

impl DHRatchet {
    /// Crear un nuevo ratchet desde un shared secret (post-X3DH)
    pub fn new(shared_secret: &[u8; 32], remote_public: PublicKey) -> Self {
        Self::new_with_role(shared_secret, remote_public, None, None, true)
    }

    /// Crear un nuevo ratchet con rol específico y opcional clave local DH
    pub fn new_with_role(
        shared_secret: &[u8; 32],
        remote_public: PublicKey,
        local_sk: Option<[u8; 32]>,
        local_public: Option<PublicKey>,
        is_alice: bool,
    ) -> Self {
        let our_dh = if let Some(sk_bytes) = local_sk {
            StaticSecret::from(sk_bytes)
        } else {
            StaticSecret::random_from_rng(OsRng)
        };
        let our_public = local_public.unwrap_or_else(|| PublicKey::from(&our_dh));

        let mut state = RatchetState::new_with_role(shared_secret, is_alice);
        state.dh_private = our_dh.to_bytes();
        state.dh_public = our_public.to_bytes();

        let shared_dh = our_dh.diffie_hellman(&remote_public);
        use hkdf::Hkdf;
        use sha2::Sha512;
        let hkdf = Hkdf::<Sha512>::new(Some(shared_secret), shared_dh.as_bytes());

        let mut root_key = [0u8; 32];
        let mut chain_key = [0u8; 32];
        let mut header_key = [0u8; HEADER_KEY_SIZE];
        let mut next_header_key = [0u8; HEADER_KEY_SIZE];

        hkdf.expand(b"root_key", &mut root_key).unwrap();
        hkdf.expand(b"chain_key", &mut chain_key).unwrap();
        hkdf.expand(b"header_key", &mut header_key).unwrap();
        hkdf.expand(b"next_header_key", &mut next_header_key).unwrap();

        state.root_key = root_key;
        state.dh_remote = Some(remote_public.to_bytes());

        state.next_header_key_recv = Some(next_header_key);

        if is_alice {
            state.sending_chain_key = chain_key;
            state.header_key_send = header_key;
            state.header_key_recv = next_header_key;
            state.next_header_key_send = Some(next_header_key);
        } else {
            state.receiving_chain_key = chain_key;
            state.header_key_recv = header_key;
            state.next_header_key_send = Some(next_header_key);
        }

        Self { state }
    }

    /// Cifrar un mensaje para enviar
    pub fn encrypt(&mut self, plaintext: &[u8], aad: &[u8]) -> EncryptedMessage {
        if self.state.sending_chain_key == [0u8; 32] {
            self.send_ratchet();
        }

        // 1. Avanzar sending chain → Message Key
        let message_key = self.advance_sending_chain();

        // 2. Cifrar cuerpo con Message Key
        let body = self.encrypt_body(plaintext, &message_key, aad);

        // 3. Construir header
        let header = self.build_header();

        // 4. Cifrar header con Header Key Send (HKs)
        let encrypted_header = self.encrypt_header(&header);

        EncryptedMessage {
            header: encrypted_header,
            ciphertext: body.ciphertext,
            nonce: body.nonce,
            message_number: self.state.message_number_sent - 1,
        }
    }

    /// Descifrar un mensaje recibido
    pub fn decrypt(&mut self, msg: &EncryptedMessage, aad: &[u8]) -> Result<Vec<u8>, RatchetError> {
        // 1. Descifrar header con Header Key Recv (HKr) o fallback NHKr
        let header = self.decrypt_header(&msg.header)?;

        // 2. Intentar skipped keys primero (Signal Section 3.5 TrySkippedMessageKeys)
        if let Some(mk) = self.take_skipped_key(&header, msg.message_number) {
            return self.decrypt_body(&msg.ciphertext, &msg.nonce, &mk, aad);
        }

        // 3. Si hay nuevo DH público, avanzar receiving chain previa hasta header.pn y hacer DH Ratchet
        if header.dh_public != self.state.dh_remote.unwrap_or([0u8; 32]) {
            if let Some(prev_dh) = self.state.dh_remote {
                if header.pn >= self.state.message_number_recv + MAX_SKIP {
                    return Err(RatchetError::MessageTooFar(MAX_SKIP));
                }
                while self.state.message_number_recv < header.pn {
                    let mk = self.advance_receiving_chain();
                    self.skip_message_key_for_dh(prev_dh, self.state.message_number_recv - 1, &mk);
                }
            }
            let remote_public = PublicKey::from(header.dh_public);
            self.dh_ratchet(remote_public);
        }

        // Si el número de mensaje es anterior al contador de recepción actual y no estaba en skipped_keys, rechazar como Replay
        if msg.message_number < self.state.message_number_recv {
            return Err(RatchetError::OldMessageReplayed);
        }

        // 4. Avanzar receiving chain actual hasta el mensaje correcto
        if msg.message_number >= self.state.message_number_recv + MAX_SKIP {
            return Err(RatchetError::MessageTooFar(MAX_SKIP));
        }

        let curr_dh = self.state.dh_remote.unwrap_or([0u8; 32]);
        while self.state.message_number_recv < msg.message_number {
            let mk = self.advance_receiving_chain();
            self.skip_message_key_for_dh(curr_dh, self.state.message_number_recv - 1, &mk);
        }

        // 5. Descifrar con la Message Key actual
        let message_key = self.advance_receiving_chain();
        self.decrypt_body(&msg.ciphertext, &msg.nonce, &message_key, aad)
    }

    // ─── DH RATCHET ───

    /// DH Ratchet - Step 1: procesar nuevo par DH remoto
    pub fn dh_ratchet(&mut self, remote_public: PublicKey) {
        let our_dh = StaticSecret::from(self.state.dh_private);
        let shared_secret = our_dh.diffie_hellman(&remote_public);

        let hkdf = Hkdf::<Sha512>::new(Some(&self.state.root_key), shared_secret.as_bytes());
        hkdf.expand(b"root_key", &mut self.state.root_key).unwrap();
        hkdf.expand(b"chain_key", &mut self.state.receiving_chain_key).unwrap();

        let mut nhk_r = [0u8; HEADER_KEY_SIZE];
        hkdf.expand(b"next_header_key", &mut nhk_r).unwrap();
        self.state.header_key_recv = nhk_r;
        self.state.next_header_key_recv = Some(nhk_r);

        self.state.dh_remote = Some(remote_public.to_bytes());
        self.state.message_number_recv = 0;
        self.state.sending_chain_key = [0u8; 32];
    }

    /// DH Ratchet - Step 2: generar nuevo par DH local para envío
    pub fn send_ratchet(&mut self) {
        let rem_pk_bytes = self.state.dh_remote.unwrap_or([0u8; 32]);
        let remote_public = PublicKey::from(rem_pk_bytes);
        let new_dh = StaticSecret::random_from_rng(OsRng);
        let new_public = PublicKey::from(&new_dh);
        let shared_secret2 = new_dh.diffie_hellman(&remote_public);

        let hkdf2 = Hkdf::<Sha512>::new(Some(&self.state.root_key), shared_secret2.as_bytes());
        hkdf2.expand(b"root_key", &mut self.state.root_key).unwrap();
        hkdf2.expand(b"chain_key", &mut self.state.sending_chain_key).unwrap();

        if let Some(nhk_s) = self.state.next_header_key_send {
            self.state.header_key_send = nhk_s;
        } else {
            hkdf2.expand(b"header_key", &mut self.state.header_key_send).unwrap();
        }

        let mut next_nhk_s = [0u8; HEADER_KEY_SIZE];
        hkdf2.expand(b"next_header_key", &mut next_nhk_s).unwrap();
        self.state.next_header_key_send = Some(next_nhk_s);

        self.state.dh_private = new_dh.to_bytes();
        self.state.dh_public = new_public.to_bytes();
        self.state.prev_message_number = self.state.message_number_sent;
        self.state.message_number_sent = 0;
    }

    // ─── SYMMETRIC RATCHET ───

    /// Avanzar sending chain → Message Key
    fn advance_sending_chain(&mut self) -> [u8; MESSAGE_KEY_SIZE] {
        let hkdf = Hkdf::<Sha512>::new(None, &self.state.sending_chain_key);
        let mut message_key = [0u8; MESSAGE_KEY_SIZE];
        hkdf.expand(b"message_key", &mut message_key).unwrap();
        hkdf.expand(b"chain_key", &mut self.state.sending_chain_key)
            .unwrap();
        self.state.message_number_sent += 1;
        message_key
    }

    /// Avanzar receiving chain → Message Key
    fn advance_receiving_chain(&mut self) -> [u8; MESSAGE_KEY_SIZE] {
        let hkdf = Hkdf::<Sha512>::new(None, &self.state.receiving_chain_key);
        let mut message_key = [0u8; MESSAGE_KEY_SIZE];
        hkdf.expand(b"message_key", &mut message_key).unwrap();
        hkdf.expand(b"chain_key", &mut self.state.receiving_chain_key)
            .unwrap();
        self.state.message_number_recv += 1;
        message_key
    }

    // ─── HEADER BUILD/ENCRYPT/DECRYPT ───

    fn build_header(&self) -> Header {
        Header {
            dh_public: self.state.dh_public,
            pn: self.state.prev_message_number,
            n: self.state.message_number_sent,
        }
    }

    fn encrypt_header(&self, header: &Header) -> Vec<u8> {
        use chacha20poly1305::{aead::Aead, KeyInit, XChaCha20Poly1305};
        use rand::RngCore;

        let mut nonce = [0u8; 24];
        OsRng.fill_bytes(&mut nonce);

        let cipher = XChaCha20Poly1305::new_from_slice(&self.state.header_key_send).unwrap();
        let plaintext = bincode::serialize(header).unwrap();
        let ciphertext = cipher.encrypt(&nonce.into(), plaintext.as_slice()).unwrap();

        let mut result = Vec::with_capacity(nonce.len() + ciphertext.len());
        result.extend_from_slice(&nonce);
        result.extend_from_slice(&ciphertext);
        result
    }

    fn decrypt_header(&mut self, encrypted: &[u8]) -> Result<Header, RatchetError> {
        use chacha20poly1305::{aead::Aead, KeyInit, XChaCha20Poly1305};

        if encrypted.len() < 24 {
            return Err(RatchetError::InvalidHeader);
        }

        let nonce = &encrypted[..24];
        let ciphertext = &encrypted[24..];

        // 1. Intento con HKr
        if let Ok(cipher) = XChaCha20Poly1305::new_from_slice(&self.state.header_key_recv) {
            if let Ok(plaintext) = cipher.decrypt(nonce.into(), ciphertext) {
                if let Ok(hdr) = bincode::deserialize(&plaintext) {
                    return Ok(hdr);
                }
            }
        }

        // 2. Fallback con NHKr
        if let Some(nhk_r) = self.state.next_header_key_recv {
            if let Ok(cipher) = XChaCha20Poly1305::new_from_slice(&nhk_r) {
                if let Ok(plaintext) = cipher.decrypt(nonce.into(), ciphertext) {
                    if let Ok(hdr) = bincode::deserialize(&plaintext) {
                        self.state.header_key_recv = nhk_r;
                        return Ok(hdr);
                    }
                }
            }
        }

        Err(RatchetError::HeaderDecryptionFailed)
    }

    // ─── SKIPPED KEYS ───

    fn take_skipped_key(&mut self, header: &Header, message_number: u32) -> Option<[u8; MESSAGE_KEY_SIZE]> {
        if let Some(idx) = self
            .state
            .skipped_keys
            .iter()
            .position(|sk| sk.dh_remote == header.dh_public && sk.message_number == message_number)
        {
            let sk = self.state.skipped_keys.remove(idx);
            Some(sk.message_key)
        } else {
            None
        }
    }

    fn skip_message_key_for_dh(&mut self, dh_remote: [u8; 32], message_number: u32, message_key: &[u8; MESSAGE_KEY_SIZE]) {
        if self.state.skipped_keys.len() < MAX_SKIP as usize {
            self.state.skipped_keys.push(SkippedKey {
                dh_remote,
                message_number,
                message_key: *message_key,
            });
        }
    }

    // ─── BODY ENCRYPT/DECRYPT ───

    fn encrypt_body(&self, plaintext: &[u8], key: &[u8; 32], aad: &[u8]) -> EncryptedBody {
        use chacha20poly1305::{
            aead::{Aead, Payload},
            KeyInit, XChaCha20Poly1305,
        };

        let cipher = XChaCha20Poly1305::new_from_slice(key).unwrap();
        let mut nonce = [0u8; 24];
        OsRng.fill_bytes(&mut nonce);

        let payload = Payload {
            msg: plaintext,
            aad,
        };
        let ciphertext = cipher.encrypt(&nonce.into(), payload).unwrap();

        EncryptedBody { ciphertext, nonce }
    }

    fn decrypt_body(
        &self,
        ciphertext: &[u8],
        nonce: &[u8],
        key: &[u8; 32],
        aad: &[u8],
    ) -> Result<Vec<u8>, RatchetError> {
        use chacha20poly1305::{
            aead::{Aead, Payload},
            KeyInit, XChaCha20Poly1305,
        };

        let cipher = XChaCha20Poly1305::new_from_slice(key).unwrap();
        let mut full_nonce = [0u8; 24];
        full_nonce.copy_from_slice(nonce);

        let payload = Payload {
            msg: ciphertext,
            aad,
        };
        cipher
            .decrypt(&full_nonce.into(), payload)
            .map_err(|_| RatchetError::DecryptionFailed)
    }
}

impl Drop for DHRatchet {
    fn drop(&mut self) {
        self.state.root_key.zeroize();
        self.state.sending_chain_key.zeroize();
        self.state.receiving_chain_key.zeroize();
        self.state.header_key_send.zeroize();
        self.state.header_key_recv.zeroize();
        self.state.dh_private.zeroize();
    }
}
