from pqcrypto.kem.ml_kem_1024 import generate_keypair, encrypt, decrypt
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os
import logging
from hermes_backend.crypto_core.zeroize import safe_zeroize

logger = logging.getLogger(__name__)

class SecurityError(Exception):
    """Error de seguridad (fail-closed)."""
    pass

class KyberManager:
    """
    Gestor de ML-KEM-1024 (Kyber) usando pqcrypto real.
    """
    
    @staticmethod
    def generate_keypair() -> tuple[bytes, bytes]:
        public_key, secret_key = generate_keypair()
        logger.info(f"Kyber-1024 keypair generated: pk={len(public_key)}B, sk={len(secret_key)}B")
        return public_key, secret_key
    
    @staticmethod
    def encapsulate(public_key: bytes) -> tuple[bytes, bytes]:
        if len(public_key) != 1568:
            raise ValueError(f"Clave pública Kyber-1024 debe ser 1568 bytes. Recibido: {len(public_key)}")
        ciphertext, shared_secret = encrypt(public_key)
        logger.info(f"Kyber encapsulate: ct={len(ciphertext)}B, ss={len(shared_secret)}B")
        return ciphertext, shared_secret
    
    @staticmethod
    def decapsulate(ciphertext: bytes, secret_key: bytes) -> bytes:
        if len(ciphertext) != 1568:
            raise ValueError(f"Ciphertext Kyber-1024 debe ser 1568 bytes. Recibido: {len(ciphertext)}")
        if len(secret_key) != 3168:
            raise ValueError(f"Clave privada Kyber-1024 debe ser 3168 bytes. Recibido: {len(secret_key)}")
        shared_secret = decrypt(secret_key, ciphertext)
        logger.info(f"Kyber decapsulate: ss={len(shared_secret)}B")
        return shared_secret
    
    @staticmethod
    def derive_aes_key(shared_secret: bytes, info: bytes = b'hermes_aes_key') -> bytes:
        hkdf = HKDF(
            algorithm=hashes.SHA512(),
            length=32,
            salt=None,
            info=info,
        )
        aes_key = hkdf.derive(shared_secret)

        try:
            # Intentamos limpiar el secreto de entrada si es mutable.
            safe_zeroize(shared_secret)  # nosemgrep
        except Exception:
            pass

        return aes_key

class AEADCipher:
    """
    Cifrado autenticado AES-256-GCM sobre secreto Kyber.
    """
    
    @staticmethod
    def encrypt(plaintext: bytes, key: bytes, associated_data: bytes = b'') -> dict:
        nonce = os.urandom(12)
        aesgcm = AESGCM(key)
        ciphertext = aesgcm.encrypt(nonce, plaintext, associated_data)
        return {
            'ciphertext': ciphertext,
            'nonce': nonce,
        }
    
    @staticmethod
    def decrypt(
        ciphertext: bytes, 
        key: bytes, 
        nonce: bytes, 
        associated_data: bytes = b''
    ) -> bytes:
        aesgcm = AESGCM(key)
        try:
            plaintext = aesgcm.decrypt(nonce, ciphertext, associated_data)
            return plaintext
        except Exception as e:
            raise SecurityError(f"AEAD decryption failed: {e}")
