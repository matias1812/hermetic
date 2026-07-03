"""
hermes_backend/crypto_core/image_encryptor.py

FASE 4 – Cifrado simétrico de imágenes efímeras (HermesChat v7)

Cada imagen usa una clave AES-256 generada aleatoriamente (per-image).
Se cifra con AES-256-GCM para autenticidad + confidencialidad.
La clave se almacena junto con la imagen cifrada en EphemeralImageStore
y se zeroiza cuando la imagen es eliminada.

NOTA: Para grupos, el servidor genera la clave y la incluye en el payload
al recuperar la imagen. En una implementación E2E completa en cliente, cada
miembro recibiría la clave cifrada con su propia clave pública Kyber.
"""

import os
import logging
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

logger = logging.getLogger(__name__)

# Tamaño de nonce para AES-GCM (96 bits / 12 bytes – NIST recomendado)
NONCE_SIZE = 12
KEY_SIZE = 32  # AES-256


class ImageEncryptor:
    """
    Cifrado y descifrado simétrico de imágenes usando AES-256-GCM.

    Se genera una clave aleatoria por imagen. La clave y el nonce
    se almacenan en EphemeralImageStore (RAM) junto al ciphertext.
    """

    @staticmethod
    def generate_key() -> bytearray:
        """Genera clave AES-256 aleatoria criptográficamente segura."""
        return bytearray(os.urandom(KEY_SIZE))

    @staticmethod
    def encrypt(
        image_data: bytes,
        aes_key: bytes | bytearray,
        associated_data: bytes = b"",
    ) -> dict:
        """
        Cifra imagen con AES-256-GCM.

        Args:
            image_data:      Bytes crudos de la imagen (PNG, JPEG, etc.)
            aes_key:         Clave AES-256 de 32 bytes
            associated_data: Datos autenticados no cifrados (ej. sender_id)

        Returns:
            {'nonce': bytearray, 'ciphertext': bytearray}
        """
        if len(aes_key) != KEY_SIZE:
            raise ValueError(f"AES key must be {KEY_SIZE} bytes, got {len(aes_key)}")

        nonce = os.urandom(NONCE_SIZE)
        aesgcm = AESGCM(bytes(aes_key))
        ciphertext = aesgcm.encrypt(nonce, image_data, associated_data or None)

        return {
            "nonce": bytearray(nonce),
            "ciphertext": bytearray(ciphertext),
        }

    @staticmethod
    def decrypt(
        ciphertext: bytes | bytearray,
        nonce: bytes | bytearray,
        aes_key: bytes | bytearray,
        associated_data: bytes = b"",
    ) -> bytes:
        """
        Descifra imagen con AES-256-GCM.

        Raises:
            cryptography.exceptions.InvalidTag si la autenticación falla.
        """
        aesgcm = AESGCM(bytes(aes_key))
        return aesgcm.decrypt(bytes(nonce), bytes(ciphertext), associated_data or None)
