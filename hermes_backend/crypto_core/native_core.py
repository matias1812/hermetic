import logging
import struct
import time
from hermes_backend.crypto_core.kyber_manager import KyberManager, AEADCipher, SecurityError
from hermes_backend.crypto_core.sphincs_manager import SphincsManager
from hermes_backend.crypto_core.hybrid_encryptor import HybridPQCEncryptor
from hermes_backend.stego_engine.csprng_disperser import CSPRNGDisperser
from hermes_backend.stego_engine.geometric_container import GeometricStegoContainer

class InvalidEnvelopeError(SecurityError):
    pass

class InvalidCiphertextError(InvalidEnvelopeError):
    pass

class InvalidNonceError(InvalidEnvelopeError):
    pass

class AuthenticationTagError(InvalidEnvelopeError):
    pass

class InvalidKemCiphertextError(InvalidEnvelopeError):
    pass

class TransientCryptoBackendError(RuntimeError):
    pass

logger = logging.getLogger(__name__)

import os

try:
    import hermes_ffi
    NATIVE_AVAILABLE = True
    logger.info(
        "\n==================================================\n"
        "Execution mode\n"
        "==================================================\n"
        "Rust FFI: Available & Active\n"
        "Engine: Native Rust/WASM Core\n"
        "=================================================="
    )
except ImportError:
    NATIVE_AVAILABLE = False
    env_mode = os.environ.get("HERMES_ENV", os.environ.get("HERMES_MODE", "development")).lower()
    if env_mode in ("production", "prod"):
        fatal_msg = (
            "\n==================================================\n"
            "FATAL: Production mode startup refused.\n"
            "==================================================\n"
            "Rust cryptographic engine ('hermes_ffi') unavailable.\n"
            "Refusing startup.\n"
            "=================================================="
        )
        logger.critical(fatal_msg)
        raise RuntimeError(fatal_msg)
    logger.warning(
        "\n==================================================\n"
        "Execution mode\n"
        "==================================================\n"
        "Rust FFI: unavailable\n\n"
        "Fallback:\n"
        "Python pqcrypto backend\n\n"
        "Algorithms:\n"
        "ML-KEM-1024\n"
        "SPHINCS+\n\n"
        "Coverage:\n"
        "✓ API\n"
        "✓ Backend\n"
        "✓ Relay\n"
        "✗ Rust FFI\n"
        "✗ WASM\n"
        "✗ HermesCore native implementation\n"
        "=================================================="
    )


class HermesNativeCore:
    """
    Authorized Unified FFI bridge to Rust cryptographic core / Python pqcrypto.
    All sensitive operations are executed via real PQC algorithms.
    """
    _otp_registry = None

    @classmethod
    def _get_registry(cls):
        if cls._otp_registry is None:
            from hermes_backend.network_core.otp_registry import OTPKeyRegistry
            cls._otp_registry = OTPKeyRegistry()
        return cls._otp_registry

    @staticmethod
    def generate_keys(session_id: str = "default_session") -> dict:
        """
        Generates real Kyber-1024 and SPHINCS+ keypairs.
        """
        if NATIVE_AVAILABLE:
            # Delegate Kyber to Rust, generating a safe Handle
            ffi_keys = hermes_ffi.generate_keys_native(session_id)
            sphincs_pk, sphincs_sk = SphincsManager.generate_keypair()
            return {
                "kyber_pk_hex": ffi_keys["kyber_pk_hex"],
                "key_handle": ffi_keys["key_handle"],
                "sphincs_pk_hex": sphincs_pk.hex(),
                "sphincs_sk_hex": sphincs_sk.hex()
            }
        else:
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
        s_bytes = sender_id.encode('utf-8')
        r_bytes = receiver_id.encode('utf-8')
        return (
            struct.pack('<Q', timestamp_int & 0xFFFFFFFFFFFFFFFF) +
            struct.pack('<I', len(s_bytes)) + s_bytes +
            struct.pack('<I', len(r_bytes)) + r_bytes
        )

    @staticmethod
    def _encode_field(name: bytes, value: bytes) -> bytes:
        return (
            len(name).to_bytes(2, "big")
            + name
            + len(value).to_bytes(8, "big")
            + value
        )

    MAX_SENDER_ID_BYTES = 256
    MAX_RECEIVER_ID_BYTES = 256
    EXPECTED_AES_NONCE_BYTES = 12
    EXPECTED_KEM_CIPHERTEXT_BYTES = 1568  # Exact match for Kyber1024
    MAX_ENCRYPTED_MESSAGE_BYTES = 10 * 1024 * 1024
    MAX_SIGNED_PAYLOAD_BYTES = 11 * 1024 * 1024  # Total limit

    @staticmethod
    def canonical_signed_payload(
        kem_algorithm: str,
        aead_algorithm: str,
        signature_algorithm: str,
        sender_id: str,
        receiver_id: str,
        timestamp_int: int,
        ciphertext_kem: bytes,
        aes_nonce: bytes,
        encrypted_message: bytes
    ) -> bytes:
        kem_alg_bytes = kem_algorithm.encode("utf-8")
        aead_alg_bytes = aead_algorithm.encode("utf-8")
        sig_alg_bytes = signature_algorithm.encode("utf-8")
        sender_id_bytes = sender_id.encode("utf-8")
        receiver_id_bytes = receiver_id.encode("utf-8")
        timestamp_bytes = timestamp_int.to_bytes(8, "big")
        version_bytes = b"\x01" # Protocol version 1

        if len(sender_id_bytes) > HermesNativeCore.MAX_SENDER_ID_BYTES:
            raise InvalidEnvelopeError(f"sender_id exceeds maximum allowed length of {HermesNativeCore.MAX_SENDER_ID_BYTES} bytes")
        if len(receiver_id_bytes) > HermesNativeCore.MAX_RECEIVER_ID_BYTES:
            raise InvalidEnvelopeError(f"receiver_id exceeds maximum allowed length of {HermesNativeCore.MAX_RECEIVER_ID_BYTES} bytes")
        
        # Ciphertext KEM exact match
        if ciphertext_kem and len(ciphertext_kem) != HermesNativeCore.EXPECTED_KEM_CIPHERTEXT_BYTES:
            raise InvalidKemCiphertextError(f"kem_ciphertext must be exactly {HermesNativeCore.EXPECTED_KEM_CIPHERTEXT_BYTES} bytes (got {len(ciphertext_kem)})")
        
        # AES-GCM Nonce exact match
        if len(aes_nonce) != HermesNativeCore.EXPECTED_AES_NONCE_BYTES:
            raise InvalidNonceError(f"AES-GCM nonce must be exactly {HermesNativeCore.EXPECTED_AES_NONCE_BYTES} bytes (got {len(aes_nonce)})")

        if len(encrypted_message) > HermesNativeCore.MAX_ENCRYPTED_MESSAGE_BYTES:
            raise InvalidEnvelopeError(f"ciphertext exceeds maximum allowed length of {HermesNativeCore.MAX_ENCRYPTED_MESSAGE_BYTES} bytes")

        # Check total estimated size BEFORE allocating the final buffer
        # prefix + (name_len + name + value_len + value) for each field
        total_size = len(b"HERMES-ENVELOPE-SIGNATURE\x00")
        total_size += 2 + len(b"version") + 8 + len(version_bytes)
        total_size += 2 + len(b"kem_algorithm") + 8 + len(kem_alg_bytes)
        total_size += 2 + len(b"aead_algorithm") + 8 + len(aead_alg_bytes)
        total_size += 2 + len(b"signature_algorithm") + 8 + len(sig_alg_bytes)
        total_size += 2 + len(b"sender_id") + 8 + len(sender_id_bytes)
        total_size += 2 + len(b"receiver_id") + 8 + len(receiver_id_bytes)
        total_size += 2 + len(b"timestamp") + 8 + len(timestamp_bytes)
        total_size += 2 + len(b"kem_ciphertext") + 8 + len(ciphertext_kem)
        total_size += 2 + len(b"aes_nonce") + 8 + len(aes_nonce)
        total_size += 2 + len(b"ciphertext") + 8 + len(encrypted_message)

        if total_size > HermesNativeCore.MAX_SIGNED_PAYLOAD_BYTES:
            raise InvalidEnvelopeError(f"Total canonical payload size ({total_size}) exceeds limit ({HermesNativeCore.MAX_SIGNED_PAYLOAD_BYTES})")

        return (
            b"HERMES-ENVELOPE-SIGNATURE\x00" +
            HermesNativeCore._encode_field(b"version", version_bytes) +
            HermesNativeCore._encode_field(b"kem_algorithm", kem_alg_bytes) +
            HermesNativeCore._encode_field(b"aead_algorithm", aead_alg_bytes) +
            HermesNativeCore._encode_field(b"signature_algorithm", sig_alg_bytes) +
            HermesNativeCore._encode_field(b"sender_id", sender_id_bytes) +
            HermesNativeCore._encode_field(b"receiver_id", receiver_id_bytes) +
            HermesNativeCore._encode_field(b"timestamp", timestamp_bytes) +
            HermesNativeCore._encode_field(b"kem_ciphertext", ciphertext_kem) +
            HermesNativeCore._encode_field(b"aes_nonce", aes_nonce) +
            HermesNativeCore._encode_field(b"ciphertext", encrypted_message)
        )

    @staticmethod
    def encrypt_envelope(
        plaintext_hex: str,
        receiver_kyber_pk_hex: str,
        sender_sphincs_sk_hex: str,
        session_key_hex: str,
        sender_id: str = "",
        receiver_id: str = "",
        sender_key_handle: str = "",
        session_id_str: str = ""
    ) -> dict:
        pt = bytes.fromhex(plaintext_hex)
        sender_sphincs_sk = bytes.fromhex(sender_sphincs_sk_hex)
        session_key = bytearray(bytes.fromhex(session_key_hex))
        timestamp_int = int(time.time())

        # Build AAD: sender_id + receiver_id + timestamp
        aad = HermesNativeCore._build_aad(sender_id, receiver_id, timestamp_int)

        if not receiver_kyber_pk_hex or receiver_kyber_pk_hex == "none":
            aes_key = KyberManager.derive_aes_key(bytes(session_key))
            encrypted = AEADCipher.encrypt(pt, aes_key, aad)
            
            message_to_sign = HermesNativeCore.canonical_signed_payload(
                "None", "AES-256-GCM", "SLH-DSA-SHA2-128f",
                sender_id, receiver_id, timestamp_int,
                b"", encrypted['nonce'], encrypted['ciphertext']
            )
            signature = SphincsManager.sign(message_to_sign, sender_sphincs_sk)
            
            disperser = CSPRNGDisperser(session_key)
            whitened_payload = disperser.whiten_data(bytearray(encrypted['ciphertext']))
            
            kyber_ciphertext_hex = ""
            encrypted_message_hex = encrypted['ciphertext'].hex()
            aes_nonce_hex = encrypted['nonce'].hex()
        else:
            if NATIVE_AVAILABLE:
                encrypted = hermes_ffi.encapsulate_and_encrypt_native(
                    receiver_kyber_pk_hex,
                    sender_key_handle,
                    session_id_str,
                    pt,
                    aad
                )
            else:
                receiver_kyber_pk = bytes.fromhex(receiver_kyber_pk_hex)
                encrypted = HybridPQCEncryptor.encrypt(
                    pt,
                    receiver_kyber_pk,
                    sender_sphincs_sk, # Only used in pure-python path to do both
                    associated_data=aad
                )

            if NATIVE_AVAILABLE:
                # SPHINCS+ signature happens here, in Python
                message_to_sign = HermesNativeCore.canonical_signed_payload(
                    "ML-KEM-1024", "AES-256-GCM", "SLH-DSA-SHA2-128f",
                    sender_id, receiver_id, timestamp_int,
                    encrypted['kyber_ciphertext'], encrypted['aes_nonce'], encrypted['encrypted_message']
                )
                signature = SphincsManager.sign(message_to_sign, sender_sphincs_sk)
            else:
                signature = encrypted['signature']
                
            disperser = CSPRNGDisperser(session_key)
            whitened_payload = disperser.whiten_data(bytearray(encrypted['encrypted_message']))
            
            kyber_ciphertext_hex = encrypted['kyber_ciphertext'].hex()
            encrypted_message_hex = encrypted['encrypted_message'].hex()
            aes_nonce_hex = encrypted['aes_nonce'].hex()

        stego_svg = GeometricStegoContainer.embed_payload(whitened_payload)

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
        session_key_hex: str,
        receiver_key_handle: str = "",
        session_id_str: str = "",
        expected_sender_id: str = ""
    ) -> bytearray:
        sender_sphincs_pk = bytes.fromhex(sender_sphincs_pk_hex)
        session_key = bytearray(bytes.fromhex(session_key_hex))

        sender_id   = package.get('sender_id', '')
        receiver_id = package.get('receiver_id', '')
        timestamp_int = int(package.get('timestamp', 0))
        
        # 2. Identidad: Verificación de Spoofing
        if not isinstance(expected_sender_id, str) or not expected_sender_id:
            raise SecurityError("expected_sender_id is required")

        # Resolving via trust store is pending (phase 2), but we simulate checking the required ID
        # trusted_public_key = trust_store.resolve_sphincs_key(expected_sender_id)
        
        import hmac
        if not hmac.compare_digest(sender_id, expected_sender_id):
            raise SecurityError("Identity spoofing detected")

        # 1. Frescura: Chequeo de timestamp asimétrico (UTC)
        import datetime
        now = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
        if timestamp_int < now - 300 or timestamp_int > now + 60:
            raise SecurityError(f"Timestamp outside of freshness window: {timestamp_int} (now: {now})")

        # 2. Identidad: AAD building (sender_id and receiver_id implicitly bound via public key caller check)
        aad = HermesNativeCore._build_aad(sender_id, receiver_id, timestamp_int)

        whitened_payload = GeometricStegoContainer.extract_payload(package['stego_container'])

        disperser = CSPRNGDisperser(session_key)
        encrypted_message = disperser.dewhiten_data(whitened_payload)

        ciphertext_kem_hex = package.get('ciphertext_kem', '')
        aes_nonce_hex = package.get('aes_nonce', '')
        if not aes_nonce_hex:
            raise SecurityError("Missing aes_nonce in encrypted package")
        aes_nonce_bytes = bytes.fromhex(aes_nonce_hex)
        signature_bytes = bytes.fromhex(package['signature'])

        # 3. Firma: Validación SPHINCS+ usando canonical_signed_payload
        ciphertext_kem_bytes = bytes.fromhex(ciphertext_kem_hex) if ciphertext_kem_hex else b""
        message_to_verify = HermesNativeCore.canonical_signed_payload(
            "ML-KEM-1024" if ciphertext_kem_bytes else "None", "AES-256-GCM", "SLH-DSA-SHA2-128f",
            sender_id, receiver_id, timestamp_int,
            ciphertext_kem_bytes, aes_nonce_bytes, bytes(encrypted_message)
        )
            
        if not SphincsManager.verify(message_to_verify, signature_bytes, sender_sphincs_pk):
            raise InvalidEnvelopeError("Firma SPHINCS+ inválida - mensaje rechazado")

        # 4. Consulta Deduplicación: Claim atómico para prevenir TOCTOU
        registry = HermesNativeCore._get_registry()
        claim_token = registry.claim(signature_bytes)
        if not claim_token:
            raise SecurityError("Replay attack detected (signature already processed)")

        try:
            # 5. Criptografía: Descifrado
            if not ciphertext_kem_hex:
                aes_key = KyberManager.derive_aes_key(bytes(session_key))
                try:
                    plaintext = AEADCipher.decrypt(encrypted_message, aes_key, aes_nonce_bytes, aad)
                except Exception as e:
                    raise InvalidCiphertextError(str(e))
            else:
                if NATIVE_AVAILABLE:
                    try:
                        plaintext = hermes_ffi.decrypt_and_decapsulate_native(
                            receiver_key_handle,
                            session_id_str,
                            ciphertext_kem_hex,
                            aes_nonce_hex,
                            encrypted_message.hex(),
                            aad
                        )
                    except Exception as e:
                        # FFI will raise PyValueError for deterministic errors
                        if "ValueError" in str(type(e)):
                            raise InvalidCiphertextError(str(e))
                        raise TransientCryptoBackendError(str(e))
                else:
                    receiver_kyber_sk = bytes.fromhex(receiver_kyber_sk_hex)
                    try:
                        from hermes_backend.crypto_core.hybrid_encryptor import HybridPQCDecryptor
                        plaintext = HybridPQCDecryptor.decrypt(
                            encrypted_message,
                            ciphertext_kem_bytes,
                            receiver_kyber_sk,
                            associated_data=aad
                        )
                    except Exception as e:
                        raise InvalidCiphertextError(str(e))

            for i in range(len(session_key)):
                session_key[i] = 0

        except InvalidEnvelopeError:
            registry.reject(signature_bytes, claim_token)
            raise
        except TransientCryptoBackendError:
            registry.release(signature_bytes, claim_token)
            raise
        except BaseException:
            # Estado incierto: no liberar automáticamente, rechazar
            registry.reject(signature_bytes, claim_token)
            raise

        try:
            registry.commit(signature_bytes, claim_token)
        except Exception as exc:
            # Nunca liberar aquí: el plaintext ya fue producido.
            raise SecurityError("Replay registry commit failed") from exc

        return bytearray(plaintext)

    @staticmethod
    def dispose_key_handle(key_handle: str, session_id_str: str) -> bool:
        if NATIVE_AVAILABLE:
            return hermes_ffi.dispose_key_handle(key_handle, session_id_str)
        return False
