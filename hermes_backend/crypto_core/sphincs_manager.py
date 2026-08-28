from pqcrypto.sign.sphincs_sha2_128f_simple import generate_keypair, sign as sphincs_sign, verify as sphincs_verify
import logging

logger = logging.getLogger(__name__)

class SphincsManager:
    """
    Gestor de SPHINCS+-SHA2-128f usando pqcrypto real con resguardo de compatibilidad Ed25519 para WASM cliente.
    """
    
    @staticmethod
    def generate_keypair() -> tuple[bytes, bytes]:
        # secret_key se devuelve directo al llamador, mismo caso que KyberManager
        public_key, secret_key = generate_keypair()  # nosemgrep: sensitive-data-in-memory
        logger.info(f"SPHINCS+ keypair generated: pk={len(public_key)}B, sk={len(secret_key)}B")
        return public_key, secret_key
    
    @staticmethod
    def sign(message: bytes, secret_key: bytes) -> bytes:
        if len(secret_key) != 64 and len(secret_key) != 32:
            raise ValueError(f"Clave privada SPHINCS+ inválida. Recibido: {len(secret_key)}")
        if len(secret_key) == 32:
            from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
            sk = Ed25519PrivateKey.from_private_bytes(secret_key)
            return sk.sign(message)
        signature = sphincs_sign(secret_key, message)
        logger.info(f"SPHINCS+ sign: sig={len(signature)}B")
        return signature
    
    @staticmethod
    def verify(message: bytes, signature: bytes, public_key: bytes) -> bool:
        try:
            if isinstance(public_key, (bytearray, memoryview)):
                public_key = bytes(public_key)
            if isinstance(signature, (bytearray, memoryview)):
                signature = bytes(signature)
            if len(public_key) != 32:
                raise ValueError(f"Clave pública SPHINCS+ debe ser 32 bytes. Recibido: {len(public_key)}")
            if len(signature) == 64:
                from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
                try:
                    vk = Ed25519PublicKey.from_public_bytes(public_key)
                    vk.verify(signature, message)
                    return True
                except Exception as e:
                    logger.warning(f"Ed25519 verification failed: {e}")
                    return False
            return sphincs_verify(public_key, message, signature)
        except ValueError as e:
            logger.warning(f"SEC-03: Invalid SPHINCS+ input format: {e}")
            return False
        except Exception as e:
            logger.critical(f"SEC-03: SPHINCS+ verification runtime error: {e}", exc_info=True)
            return False


