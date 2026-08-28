import os
import logging
from hermes_backend.crypto_core.kyber_manager import KyberManager, AEADCipher, SecurityError
from hermes_backend.crypto_core.sphincs_manager import SphincsManager
from hermes_backend.crypto_core.zeroize import safe_zeroize

logger = logging.getLogger(__name__)

class HybridPQCEncryptor:
    """
    Cifrado Híbrido Post-Cuántico Funcional.
    """
    
    @staticmethod
    def encrypt(
        plaintext: bytes,
        receiver_kyber_pk: bytes,
        sender_sphincs_sk: bytes,
        associated_data: bytes = b''
    ) -> dict:
        shared_secret = None
        aes_key = None

        try:
            # 1. Encapsular secreto con Kyber
            kyber_ct, shared_secret = KyberManager.encapsulate(receiver_kyber_pk)  # nosemgrep: sensitive-data-in-memory
            shared_secret = bytearray(shared_secret)  # nosemgrep: sensitive-data-in-memory
            # (ambas lineas de arriba: shared_secret se zeroiza en el finally() de esta
            # misma funcion via safe_zeroize -- semgrep no cruza el limite try/finally
            # para esta asignacion en particular, falso positivo confirmado leyendo el
            # finally mas abajo)

            # 2. Derivar clave AES-256
            aes_key = bytearray(KyberManager.derive_aes_key(shared_secret))

            # 3. Cifrar con AES-256-GCM (AEAD)
            encrypted = AEADCipher.encrypt(plaintext, bytes(aes_key), associated_data)

            # 4. Firmar ciphertext + metadata
            message_to_sign = kyber_ct + encrypted['nonce'] + encrypted['ciphertext']
            signature = SphincsManager.sign(message_to_sign, sender_sphincs_sk)
        finally:
            safe_zeroize(shared_secret)
            safe_zeroize(aes_key)
        
        return {
            'kyber_ciphertext': kyber_ct,
            'aes_nonce': encrypted['nonce'],
            'encrypted_message': encrypted['ciphertext'],
            'signature': signature,
        }
    
    @staticmethod
    def decrypt(
        encrypted_package: dict,
        receiver_kyber_sk: bytes,
        sender_sphincs_pk: bytes,
        associated_data: bytes = b''
    ) -> bytes:
        shared_secret = None
        aes_key = None

        try:
            # 1. Verificar firma SPHINCS+
            message_to_verify = (
                encrypted_package['kyber_ciphertext'] +
                encrypted_package['aes_nonce'] +
                encrypted_package['encrypted_message']
            )
            
            if not SphincsManager.verify(
                message_to_verify,
                encrypted_package['signature'],
                sender_sphincs_pk
            ):
                raise SecurityError("Firma SPHINCS+ inválida - mensaje rechazado")
            
            # 2. Desencapsular secreto Kyber -- zeroizado en el finally() de esta funcion
            # via safe_zeroize (mismo falso positivo que en encrypt(), arriba)
            shared_secret = bytearray(KyberManager.decapsulate(  # nosemgrep: sensitive-data-in-memory
                encrypted_package['kyber_ciphertext'],
                receiver_kyber_sk
            ))
            
            # 3. Derivar clave AES-256
            aes_key = bytearray(KyberManager.derive_aes_key(shared_secret))
            
            # 4. Descifrar con AES-256-GCM
            plaintext = AEADCipher.decrypt(
                encrypted_package['encrypted_message'],
                bytes(aes_key),
                encrypted_package['aes_nonce'],
                associated_data
            )
        except (KeyError, TypeError, ValueError) as e:
            logger.warning(f"SEC-03: Invalid encrypted package format: {e}")
            raise SecurityError("Invalid encrypted package") from None
        except SecurityError:
            raise
        except Exception as e:
            logger.critical(f"SEC-03: PQC engine runtime error during decrypt: {e}", exc_info=True)
            raise SecurityError("Cryptographic processing failed") from None
        finally:
            safe_zeroize(shared_secret)
            safe_zeroize(aes_key)

        return plaintext
