from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

class CSPRNGDisperser:
    """
    AES-256-CTR based CSPRNG mask generator.
    """

    def __init__(self, hkdf_key: bytearray):
        # Derive AES key (32 bytes) and Nonce base (16 bytes) to satisfy AES block size
        hkdf = HKDF(
            algorithm=hashes.SHA512(),
            length=48,
            salt=None,
            info=b'csprng_disperser_hermes_v1',
        )
        key_material = bytearray(hkdf.derive(bytes(hkdf_key)))

        self.aes_key = bytes(key_material[:32])
        self.nonce_base = bytes(key_material[32:48])
        self.block_counter = 0

        # Zeroize derived key material buffer immediately in-place
        for i in range(len(key_material)):
            key_material[i] = 0

    def generate_mask(self, length: int) -> bytearray:
        nonce = bytearray(self.nonce_base)
        counter_bytes = self.block_counter.to_bytes(4, 'big')

        # XOR block counter into last 4 bytes of 16-byte nonce base
        for i in range(4):
            nonce[-4 + i] ^= counter_bytes[i]

        cipher = Cipher(
            algorithms.AES(self.aes_key),
            modes.CTR(bytes(nonce))
        )
        encryptor = cipher.encryptor()
        keystream = encryptor.update(b'\x00' * length) + encryptor.finalize()
        self.block_counter += (length // 16) + 1

        return bytearray(keystream[:length])

    def whiten_data(self, data: bytearray) -> bytearray:
        mask = self.generate_mask(len(data))
        
        result = bytearray(len(data))
        for i in range(len(data)):
            result[i] = data[i] ^ mask[i]
            
        # Zeroize mask buffer
        for i in range(len(mask)):
            mask[i] = 0
            
        return result

    def dewhiten_data(self, whitened_data: bytearray) -> bytearray:
        return self.whiten_data(whitened_data)
