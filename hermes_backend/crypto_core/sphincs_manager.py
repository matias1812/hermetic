from pqcrypto.sign.sphincs_sha2_128f_simple import generate_keypair, sign, verify
import logging

logger = logging.getLogger(__name__)

class SphincsManager:
    """
    Gestor de SPHINCS+-SHA2-128f usando pqcrypto real.
    """
    
    @staticmethod
    def generate_keypair() -> tuple[bytes, bytes]:
        public_key, secret_key = generate_keypair()
        logger.info(f"SPHINCS+ keypair generated: pk={len(public_key)}B, sk={len(secret_key)}B")
        return public_key, secret_key
    
    @staticmethod
    def sign(message: bytes, secret_key: bytes) -> bytes:
        if len(secret_key) != 64:
            raise ValueError(f"Clave privada SPHINCS+ debe ser 64 bytes. Recibido: {len(secret_key)}")
        signature = sign(secret_key, message)
        logger.info(f"SPHINCS+ sign: sig={len(signature)}B")
        return signature
    
    @staticmethod
    def verify(message: bytes, signature: bytes, public_key: bytes) -> bool:
        if len(public_key) != 32:
            raise ValueError(f"Clave pública SPHINCS+ debe ser 32 bytes. Recibido: {len(public_key)}")
        return verify(public_key, message, signature)
