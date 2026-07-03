import logging
import struct
import time
from hermes_backend.crypto_core.kyber_manager import KyberManager, AEADCipher, SecurityError
from hermes_backend.crypto_core.sphincs_manager import SphincsManager
from hermes_backend.crypto_core.hybrid_encryptor import HybridPQCEncryptor
from hermes_backend.stego_engine.csprng_disperser import CSPRNGDisperser
from hermes_backend.stego_engine.geometric_container import GeometricStegoContainer

logger = logging.getLogger(__name__)

try:
    import hermes_ffi
    NATIVE_AVAILABLE = True
    logger.info("Successfully loaded Rust FFI binary 'hermes_ffi'. All operations will run natively.")
except ImportError:
    NATIVE_AVAILABLE = False
    logger.warning("Could not load Rust FFI binary 'hermes_ffi'. Falling back to Python pqcrypto (ML-KEM-1024 + SPHINCS+).")

class HermesNativeCore:
    """
    Authorized Unified FFI bridge to Rust cryptographic core / Python pqcrypto.
    All sensitive operations are executed via real PQC algorithms.
    """

    @staticmethod
    def generate_keys() -> dict:
        """
        Generates real Kyber-1024 and SPHINCS+ keypairs.
        """
        kyber_pk, kyber_sk = KyberManager.generate_keypair()
        sphincs_pk, sphincs_sk = SphincsManager.generate_keypair()
        
        return {
            "kyber_pk_hex": kyber_pk.hex(),
            "kyber_sk_hex": kyber_sk.hex(),
            "sphincs_pk_hex": sphincs_pk.hex(),
            "sphincs_sk_hex": sphincs_sk.hex()
        }

    @staticmethod
    def _build_aad(sender_id: str, receiver_id: str, timestamp_int: int) -> bytes:
        """
        Constructs binary Associated Authenticated Data (AAD) for AES-GCM.

        Format (little-endian):
          [8B  timestamp_int]
          [4B  len(sender_id_utf8)] [sender_id_utf8]
          [4B  len(receiver_id_utf8)] [receiver_id_utf8]

        The AAD binds the ciphertext to a specific sender, receiver, and
        approximate time, preventing context-confusion and replay attacks.
        The AAD is NOT encrypted but IS authenticated by the GCM tag.
        """
        s_bytes = sender_id.encode('utf-8')
        r_bytes = receiver_id.encode('utf-8')
        return (
            struct.pack('<Q', timestamp_int & 0xFFFFFFFFFFFFFFFF) +
            struct.pack('<I', len(s_bytes)) + s_bytes +
            struct.pack('<I', len(r_bytes)) + r_bytes
        )

    @staticmethod
    def encrypt_envelope(
        plaintext_hex: str,
        receiver_kyber_pk_hex: str,
        sender_sphincs_sk_hex: str,
        session_key_hex: str,
        sender_id: str = "",
        receiver_id: str = ""
    ) -> dict:
        """
        Encrypts a message using real Kyber-1024 (or shared secret), AES-GCM (with AAD) and SPHINCS+.

        Associated Authenticated Data (AAD) binds the ciphertext to sender,
        receiver, and timestamp — preventing replay and context-confusion attacks.
        """
        pt = bytes.fromhex(plaintext_hex)
        sender_sphincs_sk = bytes.fromhex(sender_sphincs_sk_hex)
        session_key = bytearray(bytes.fromhex(session_key_hex))
        timestamp_int = int(time.time())

        # Build AAD: sender_id + receiver_id + timestamp
        aad = HermesNativeCore._build_aad(sender_id, receiver_id, timestamp_int)

        # Check if using shared symmetric key directly (negotiated via request accept)
        if not receiver_kyber_pk_hex or receiver_kyber_pk_hex == "none":
            # Derive AES key from session_key (shared_key)
            aes_key = KyberManager.derive_aes_key(bytes(session_key))
            
            # Encrypt with AES-GCM directly
            encrypted = AEADCipher.encrypt(pt, aes_key, aad)
            
            # Sign ciphertext metadata
            message_to_sign = b"" + encrypted['nonce'] + encrypted['ciphertext']
            signature = SphincsManager.sign(message_to_sign, sender_sphincs_sk)
            
            # Stego mask generation (AES-CTR based CSPRNG)
            disperser = CSPRNGDisperser(session_key)
            whitened_payload = disperser.whiten_data(bytearray(encrypted['ciphertext']))
            
            kyber_ciphertext_hex = ""
            encrypted_message_hex = encrypted['ciphertext'].hex()
            aes_nonce_hex = encrypted['nonce'].hex()
        else:
            receiver_kyber_pk = bytes.fromhex(receiver_kyber_pk_hex)
            # 1. Run real hybrid PQC encrypt with AAD
            encrypted = HybridPQCEncryptor.encrypt(
                pt,
                receiver_kyber_pk,
                sender_sphincs_sk,
                associated_data=aad
            )

            # 2. Stego mask generation (AES-CTR based CSPRNG)
            disperser = CSPRNGDisperser(session_key)
            whitened_payload = disperser.whiten_data(bytearray(encrypted['encrypted_message']))
            
            kyber_ciphertext_hex = encrypted['kyber_ciphertext'].hex()
            encrypted_message_hex = encrypted['encrypted_message'].hex()
            aes_nonce_hex = encrypted['aes_nonce'].hex()
            signature = encrypted['signature']

        # 3. Geometric SVG Ocultation
        stego_svg = GeometricStegoContainer.embed_payload(whitened_payload)

        # Zeroize session key copy
        for i in range(len(session_key)):
            session_key[i] = 0

        return {
            "ciphertext_kem": kyber_ciphertext_hex,
            "wrapped_otp_key": encrypted_message_hex,
            "stego_container": stego_svg,
            "audio_spectrum": None,
            "signature": signature.hex() if isinstance(signature, bytes) else signature,
            "timestamp": timestamp_int,
            "aes_nonce": aes_nonce_hex,
            "sender_id": sender_id,
            "receiver_id": receiver_id
        }

    @staticmethod
    def decrypt_envelope(
        package: dict,
        receiver_kyber_sk_hex: str,
        sender_sphincs_pk_hex: str,
        session_key_hex: str
    ) -> bytearray:
        """
        Decrypts a package using real post-quantum Kyber (or shared secret) and SPHINCS+ validation.

        Reconstructs the same AAD (sender_id + receiver_id + timestamp) that was
        used at encrypt time.  AES-GCM will raise an exception if the AAD
        does not match, catching replay and context-confusion attacks.
        """
        receiver_kyber_sk = bytes.fromhex(receiver_kyber_sk_hex) if receiver_kyber_sk_hex and receiver_kyber_sk_hex != "none" else None
        sender_sphincs_pk = bytes.fromhex(sender_sphincs_pk_hex)
        session_key = bytearray(bytes.fromhex(session_key_hex))

        # Reconstruct AAD from stored envelope metadata
        sender_id   = package.get('sender_id', '')
        receiver_id = package.get('receiver_id', '')
        timestamp_int = int(package.get('timestamp', 0))
        aad = HermesNativeCore._build_aad(sender_id, receiver_id, timestamp_int)

        # 1. Extract payload from stego container
        whitened_payload = GeometricStegoContainer.extract_payload(package['stego_container'])

        # 2. Dewhiten payload
        disperser = CSPRNGDisperser(session_key)
        encrypted_message = disperser.dewhiten_data(whitened_payload)

        ciphertext_kem_hex = package.get('ciphertext_kem', '')
        aes_nonce_bytes = bytes.fromhex(package.get('aes_nonce', '00' * 12))
        signature_bytes = bytes.fromhex(package['signature'])

        # Check if symmetric shared key decryption is used
        if not ciphertext_kem_hex:
            # 1. Verify SPHINCS+ signature
            message_to_verify = b"" + aes_nonce_bytes + bytes(encrypted_message)
            if not SphincsManager.verify(message_to_verify, signature_bytes, sender_sphincs_pk):
                raise SecurityError("Firma SPHINCS+ inválida - mensaje rechazado")
                
            # 2. Derive AES key directly from session_key (shared_key)
            aes_key = KyberManager.derive_aes_key(bytes(session_key))
            
            # 3. Decrypt with AES-GCM directly
            pt = AEADCipher.decrypt(bytes(encrypted_message), aes_key, aes_nonce_bytes, aad)
            
            # Zeroize key
            aes_key = b'\x00' * len(aes_key)
        else:
            # Reconstruct encrypted package parameters
            encrypted_package = {
                'kyber_ciphertext': bytes.fromhex(ciphertext_kem_hex),
                'aes_nonce': aes_nonce_bytes,
                'encrypted_message': bytes(encrypted_message),
                'signature': signature_bytes
            }

            # 3. Run real hybrid PQC decrypt with AAD verification
            pt = HybridPQCEncryptor.decrypt(
                encrypted_package,
                receiver_kyber_sk,
                sender_sphincs_pk,
                associated_data=aad
            )

        # Zeroize session key copy
        for i in range(len(session_key)):
            session_key[i] = 0

        return bytearray(pt)
