import unittest
import secrets
from hypothesis import given, settings, strategies as st
from hermes_backend.crypto_core.kyber_manager import KyberManager
from hermes_backend.crypto_core.sphincs_manager import SphincsManager
from hermes_backend.crypto_core.hybrid_encryptor import HybridPQCEncryptor
from hermes_backend.crypto_core.native_core import HermesNativeCore, SecurityError as NativeSecurityError

class TestHybridPQCEncryptor(unittest.TestCase):
    """Tests de ida y vuelta con criptografía REAL."""

    def setUp(self):
        """Generar claves reales."""
        self.receiver_pk, self.receiver_sk = KyberManager.generate_keypair()
        self.sender_pk, self.sender_sk = SphincsManager.generate_keypair()
        self.encryptor = HybridPQCEncryptor()

    def test_encrypt_decrypt_roundtrip(self):
        """Test: encrypt(decrypt(M)) == M"""
        messages = [
            b"Hello, Hermes!",
            b"Test message with unicode: cafe",
            b"A" * 100,
            b"\x00\xFF\x42" * 10,
        ]

        for original in messages:
            with self.subTest(msg=original[:50]):
                encrypted = self.encryptor.encrypt(
                    plaintext=original,
                    receiver_kyber_pk=self.receiver_pk,
                    sender_sphincs_sk=self.sender_sk,
                )
                decrypted = self.encryptor.decrypt(
                    encrypted_package=encrypted,
                    receiver_kyber_sk=self.receiver_sk,
                    sender_sphincs_pk=self.sender_pk,
                )
                self.assertEqual(original, decrypted, "encrypt(decrypt(M)) != M")

    def test_aad_roundtrip(self):
        """Test: AAD correcto → descifrado OK."""
        original = b"Message with AAD context binding"
        aad = b"sender:alice|receiver:bob|ts:1234567890"

        encrypted = self.encryptor.encrypt(
            plaintext=original,
            receiver_kyber_pk=self.receiver_pk,
            sender_sphincs_sk=self.sender_sk,
            associated_data=aad,
        )
        decrypted = self.encryptor.decrypt(
            encrypted_package=encrypted,
            receiver_kyber_sk=self.receiver_sk,
            sender_sphincs_pk=self.sender_pk,
            associated_data=aad,
        )
        self.assertEqual(original, decrypted, "AAD roundtrip FAILED")

    def test_aad_mismatch_rejected(self):
        """Test: AAD distinto en decrypt → excepción (replay/context-confusion)."""
        original = b"Message with AAD"
        aad_enc = b"sender:alice|receiver:bob|ts:1000"
        aad_dec = b"sender:alice|receiver:bob|ts:9999"  # timestamp alterado

        encrypted = self.encryptor.encrypt(
            plaintext=original,
            receiver_kyber_pk=self.receiver_pk,
            sender_sphincs_sk=self.sender_sk,
            associated_data=aad_enc,
        )
        with self.assertRaises(Exception, msg="AAD mismatch should raise"):
            self.encryptor.decrypt(
                encrypted_package=encrypted,
                receiver_kyber_sk=self.receiver_sk,
                sender_sphincs_pk=self.sender_pk,
                associated_data=aad_dec,
            )

    def test_signature_verification(self):
        """Test: firma inválida debe ser rechazada."""
        original = b"Test signature verification"

        encrypted = self.encryptor.encrypt(
            plaintext=original,
            receiver_kyber_pk=self.receiver_pk,
            sender_sphincs_sk=self.sender_sk,
        )
        tampered = encrypted.copy()
        tampered['signature'] = b'\x00' * len(tampered['signature'])

        with self.assertRaises(Exception):
            self.encryptor.decrypt(
                encrypted_package=tampered,
                receiver_kyber_sk=self.receiver_sk,
                sender_sphincs_pk=self.sender_pk,
            )

    def test_wrong_recipient_cannot_decrypt(self):
        """Test: receptor equivocado no puede descifrar."""
        wrong_pk, wrong_sk = KyberManager.generate_keypair()
        original = b"Secret message"

        encrypted = self.encryptor.encrypt(
            plaintext=original,
            receiver_kyber_pk=self.receiver_pk,
            sender_sphincs_sk=self.sender_sk,
        )
        with self.assertRaises(Exception):
            self.encryptor.decrypt(
                encrypted_package=encrypted,
                receiver_kyber_sk=wrong_sk,
                sender_sphincs_pk=self.sender_pk,
            )

    def test_native_core_aad_build(self):
        """Test: _build_aad produce bytes deterministas."""
        aad1 = HermesNativeCore._build_aad("alice", "bob", 1234567890)
        aad2 = HermesNativeCore._build_aad("alice", "bob", 1234567890)
        aad_diff = HermesNativeCore._build_aad("alice", "carol", 1234567890)
        self.assertEqual(aad1, aad2, "AAD must be deterministic")
        self.assertNotEqual(aad1, aad_diff, "Different receiver must produce different AAD")
        self.assertGreater(len(aad1), 8, "AAD must carry meaningful payload")

    def test_native_core_decrypt_rejects_malformed_sender_public_key(self):
        session_key_hex = secrets.token_hex(32)
        envelope = HermesNativeCore.encrypt_envelope(
            plaintext_hex="48656c6c6f",
            receiver_kyber_pk_hex=self.receiver_pk.hex(),
            sender_sphincs_sk_hex=self.sender_sk.hex(),
            session_key_hex=session_key_hex,
            sender_id="alice",
            receiver_id="bob",
            sender_key_handle="",
            session_id_str="testsession"
        )

        with self.assertRaises(NativeSecurityError):
            HermesNativeCore.decrypt_envelope(
                envelope,
                receiver_kyber_sk_hex=self.receiver_sk.hex(),
                sender_sphincs_pk_hex="zz",
                session_key_hex=session_key_hex,
                receiver_key_handle="",
                session_id_str="testsession",
                expected_sender_id="alice"
            )

    def test_native_core_decrypt_rejects_invalid_signature_hex(self):
        session_key_hex = secrets.token_hex(32)
        envelope = HermesNativeCore.encrypt_envelope(
            plaintext_hex="48656c6c6f",
            receiver_kyber_pk_hex=self.receiver_pk.hex(),
            sender_sphincs_sk_hex=self.sender_sk.hex(),
            session_key_hex=session_key_hex,
            sender_id="alice",
            receiver_id="bob",
            sender_key_handle="",
            session_id_str="testsession"
        )
        envelope['signature'] = "zz"

        with self.assertRaises(NativeSecurityError):
            HermesNativeCore.decrypt_envelope(
                envelope,
                receiver_kyber_sk_hex=self.receiver_sk.hex(),
                sender_sphincs_pk_hex=self.sender_pk.hex(),
                session_key_hex=session_key_hex,
                receiver_key_handle="",
                session_id_str="testsession",
                expected_sender_id="alice"
            )

    def test_secure_xml_parsing(self):
        """Test: xml parsing defuses external entities / XXE."""
        from hermes_backend.stego_engine.geometric_container import GeometricStegoContainer
        
        # XML Entity Expansion payload (Billion Laughs style structure)
        xxe_svg = """<?xml version="1.0" encoding="utf-8"?>
        <!DOCTYPE svg [
          <!ENTITY lol "lol">
          <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
          <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
        ]>
        <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" data-hermes-payload="010203">
          <text>&lol3;</text>
        </svg>"""
        
        # Attempt to parse. It must parse safely (or raise ValueError due to missing payload in entity, but not resolve entities).
        try:
            payload = GeometricStegoContainer.extract_payload(xxe_svg)
            # If standard parser is used with resolve_entities=False, &lol3; is not resolved or kept as reference
            self.assertEqual(payload, bytearray([1, 2, 3]))
        except ValueError:
            # Rejection or parsing failure of entity is also acceptable/safe behavior
            pass

    @settings(max_examples=100, deadline=None)
    @given(st.binary(min_size=1, max_size=1024), st.binary(min_size=0, max_size=512))
    def test_hypothesis_encryption_properties(self, plaintext_data, aad_data):
        """Test Fuzzing (Propiedades): encrypt(decrypt(M)) == M para entradas masivas aleatorias."""
        # Se verifica que datos arbitrarios binarios no rompen las matemáticas del HybridPQCEncryptor
        encrypted = self.encryptor.encrypt(
            plaintext=plaintext_data,
            receiver_kyber_pk=self.receiver_pk,
            sender_sphincs_sk=self.sender_sk,
            associated_data=aad_data if len(aad_data) > 0 else None,
        )
        
        decrypted = self.encryptor.decrypt(
            encrypted_package=encrypted,
            receiver_kyber_sk=self.receiver_sk,
            sender_sphincs_pk=self.sender_pk,
            associated_data=aad_data if len(aad_data) > 0 else None,
        )
        self.assertEqual(plaintext_data, decrypted, "Invariante de descifrado roto bajo Fuzzing")

if __name__ == '__main__':
    unittest.main()


