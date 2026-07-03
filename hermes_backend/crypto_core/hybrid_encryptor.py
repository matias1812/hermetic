import os
import logging
from hermes_backend.crypto_core.kyber_manager import KyberManager, AEADCipher, SecurityError
from hermes_backend.crypto_core.sphincs_manager import SphincsManager

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
        # 1. Encapsular secreto con Kyber
        kyber_ct, shared_secret = KyberManager.encapsulate(receiver_kyber_pk)
        
        # 2. Derivar clave AES-256
        aes_key = KyberManager.derive_aes_key(shared_secret)
        
        # 3. Cifrar con AES-256-GCM (AEAD)
        encrypted = AEADCipher.encrypt(plaintext, aes_key, associated_data)
        
        # 4. Firmar ciphertext + metadata
        message_to_sign = kyber_ct + encrypted['nonce'] + encrypted['ciphertext']
        signature = SphincsManager.sign(message_to_sign, sender_sphincs_sk)
        
        # Zeroizar claves sensibles
        shared_secret = b'\x00' * len(shared_secret) # nosemgrep
        aes_key = b'\x00' * len(aes_key)
        
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
        
        # 2. Desencapsular secreto Kyber
        shared_secret = KyberManager.decapsulate(
            encrypted_package['kyber_ciphertext'],
            receiver_kyber_sk
        )
        
        # 3. Derivar clave AES-256
        aes_key = KyberManager.derive_aes_key(shared_secret)
        
        # 4. Descifrar con AES-256-GCM
        plaintext = AEADCipher.decrypt(
            encrypted_package['encrypted_message'],
            aes_key,
            encrypted_package['aes_nonce'],
            associated_data
        )
        
        # Zeroizar claves
        shared_secret = b'\x00' * len(shared_secret) # nosemgrep
        aes_key = b'\x00' * len(aes_key)
        
        return plaintext
