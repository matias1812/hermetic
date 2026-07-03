#!/usr/bin/env python3
"""
tests/property_based/test_crypto_properties.py

Property-based testing de las propiedades criptográficas de HermesChat
usando Hypothesis (framework de fuzzing/property testing para Python).

EJECUTAR:
    pip install hypothesis pytest
    pytest tests/property_based/test_crypto_properties.py -v

PROPIEDADES VERIFICADAS:
    - XOR involutividad: A ^ B ^ B = A para todo A, B de igual longitud
    - XOR conmutatividad: A ^ B = B ^ A
    - Zeroización: bytearray zeroizado tiene todos bytes = 0
    - AES-GCM round-trip: decrypt(encrypt(p)) = p
    - AES-GCM tamper detection: decrypt(tamper(encrypt(p))) = None
    - Nonces únicos: encrypt(p1) != encrypt(p2) aunque p1 = p2

NOTA SOBRE ENTORNO:
    Este módulo implementa las mismas propiedades que lib.rs (Rust) en Python
    para verificación independiente del lenguaje. La implementación Python usa
    cryptography.hazmat (auditada) como referencia.
"""

import os
import struct
import hashlib
from hypothesis import given, settings, assume, HealthCheck
from hypothesis import strategies as st
import pytest

# ==============================================================================
# Implementación de referencia Python (espeja lib.rs para comparación)
# ==============================================================================

def constant_time_xor(a: bytes, b: bytes) -> bytes:
    """Implementación Python de HermesCrypto::constant_time_xor"""
    if len(a) != len(b):
        raise ValueError(f"XOR length mismatch: {len(a)} vs {len(b)}")
    return bytes(x ^ y for x, y in zip(a, b))


def secure_zeroize(data: bytearray) -> bool:
    """Implementación Python de HermesCrypto::secure_zeroize"""
    if len(data) == 0:
        return True

    # Si ya está zeroizado, no hay nada que hacer → OK
    if all(b == 0 for b in data):
        for i in range(len(data)):
            data[i] = 0
        return True

    # Hash antes de zeroizar
    original_hash = hashlib.sha3_256(bytes(data)).digest()

    # Zeroizar
    for i in range(len(data)):
        data[i] = 0

    # Hash después
    new_hash = hashlib.sha3_256(bytes(data)).digest()

    return original_hash != new_hash and all(b == 0 for b in data)


try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    _CRYPTOGRAPHY_AVAILABLE = True
except ImportError:
    _CRYPTOGRAPHY_AVAILABLE = False


class PythonHermesCrypto:
    """Referencia Python de HermesCrypto (para property testing)"""

    NONCE_SIZE = 12  # 96 bits
    TAG_SIZE = 16    # 128 bits

    def __init__(self):
        self.key = os.urandom(32)  # AES-256
        self.nonce_counter = 0

    def encrypt_aead(self, plaintext: bytes) -> bytes:
        if not _CRYPTOGRAPHY_AVAILABLE:
            pytest.skip("cryptography package not available")

        nonce = struct.pack('>Q', self.nonce_counter) + b'\x00' * 4  # 12 bytes
        self.nonce_counter += 1

        aesgcm = AESGCM(self.key)
        ciphertext = aesgcm.encrypt(nonce, plaintext, None)  # None = no AAD
        return nonce + ciphertext

    def decrypt_aead(self, ciphertext_with_nonce: bytes):
        if not _CRYPTOGRAPHY_AVAILABLE:
            pytest.skip("cryptography package not available")

        if len(ciphertext_with_nonce) < self.NONCE_SIZE + self.TAG_SIZE:
            return None

        nonce = ciphertext_with_nonce[:self.NONCE_SIZE]
        ciphertext = ciphertext_with_nonce[self.NONCE_SIZE:]

        try:
            aesgcm = AESGCM(self.key)
            return aesgcm.decrypt(nonce, ciphertext, None)
        except Exception:
            return None  # Tag verification failed


# ==============================================================================
# PROPIEDADES: XOR
# ==============================================================================

class TestXORProperties:
    """Propiedades matemáticas del XOR — deben sostenerse para TODO input."""

    @given(data=st.binary(min_size=1, max_size=1024))
    @settings(max_examples=500, suppress_health_check=[HealthCheck.too_slow])
    def test_xor_involutivity(self, data: bytes):
        """A ^ B ^ B = A (XOR es su propio inverso)"""
        key = os.urandom(len(data))
        ciphertext = constant_time_xor(data, key)
        recovered = constant_time_xor(ciphertext, key)
        assert data == recovered, f"XOR involutividad violada para longitud {len(data)}"

    @given(
        length=st.integers(min_value=1, max_value=256),
        a=st.binary(min_size=256, max_size=256),
        b=st.binary(min_size=256, max_size=256),
    )
    @settings(max_examples=500)
    def test_xor_commutativity(self, length: int, a: bytes, b: bytes):
        """A ^ B = B ^ A (XOR es conmutativo) — misma longitud garantizada"""
        a = a[:length]
        b = b[:length]
        assert constant_time_xor(a, b) == constant_time_xor(b, a), \
            "XOR conmutatividad violada"

    @given(
        length=st.integers(min_value=1, max_value=85),
        abc=st.binary(min_size=255, max_size=255),
    )
    @settings(max_examples=300)
    def test_xor_associativity(self, length: int, abc: bytes):
        """(A ^ B) ^ C = A ^ (B ^ C) (XOR es asociativo) — misma longitud garantizada"""
        a = abc[:length]
        b = abc[length:length*2]
        c = abc[length*2:length*3]
        lhs = constant_time_xor(constant_time_xor(a, b), c)
        rhs = constant_time_xor(a, constant_time_xor(b, c))
        assert lhs == rhs, "XOR asociatividad violada"

    @given(data=st.binary(min_size=1, max_size=256))
    @settings(max_examples=200)
    def test_xor_with_self_gives_zero(self, data: bytes):
        """A ^ A = 0...0 (XOR consigo mismo da cero)"""
        result = constant_time_xor(data, data)
        assert all(b == 0 for b in result), "A ^ A debe dar 0 en todos los bytes"

    @given(data=st.binary(min_size=1, max_size=256))
    @settings(max_examples=200)
    def test_xor_with_zero_is_identity(self, data: bytes):
        """A ^ 0 = A (XOR con cero es identidad)"""
        zeros = bytes(len(data))
        result = constant_time_xor(data, zeros)
        assert result == data, "A ^ 0 debe ser A"

    def test_xor_length_mismatch_raises(self):
        """Longitudes distintas deben lanzar ValueError"""
        with pytest.raises(ValueError, match="length mismatch"):
            constant_time_xor(b"short", b"longer_string")


# ==============================================================================
# PROPIEDADES: Zeroización
# ==============================================================================

class TestZeroizationProperties:
    """Propiedades de zeroización segura."""

    @given(data=st.binary(min_size=1, max_size=4096))
    @settings(max_examples=300)
    def test_zeroize_all_bytes_become_zero(self, data: bytes):
        """Después de zeroizar, todos los bytes son 0 (incluye caso pre-zeroizado)"""
        buf = bytearray(data)
        result = secure_zeroize(buf)
        assert result is True, \
            f"secure_zeroize debe retornar True (data={data[:8]!r}...)"
        assert all(b == 0 for b in buf), \
            f"No todos los bytes son 0 después de zeroizar (len={len(data)})"

    def test_zeroize_empty_buffer(self):
        """Buffer vacío → True (trivialmente correcto)"""
        buf = bytearray()
        assert secure_zeroize(buf) is True

    @given(data=st.binary(min_size=1, max_size=256))
    @settings(max_examples=200)
    def test_zeroize_changes_non_zero_data(self, data: bytes):
        """Si hay algún byte no-cero, el hash debe cambiar"""
        assume(any(b != 0 for b in data))  # Al menos un byte no-cero
        buf = bytearray(data)
        original_hash = hashlib.sha3_256(bytes(buf)).digest()
        secure_zeroize(buf)
        new_hash = hashlib.sha3_256(bytes(buf)).digest()
        assert original_hash != new_hash, \
            "Hash no cambió después de zeroizar datos no-cero"


# ==============================================================================
# PROPIEDADES: AES-256-GCM
# ==============================================================================

class TestAEADProperties:
    """Propiedades del cifrado AES-256-GCM autenticado."""

    @given(plaintext=st.binary(min_size=0, max_size=1024))
    @settings(max_examples=200, suppress_health_check=[HealthCheck.too_slow])
    def test_aead_roundtrip(self, plaintext: bytes):
        """decrypt(encrypt(p)) = p para todo p"""
        if not _CRYPTOGRAPHY_AVAILABLE:
            pytest.skip("cryptography package not available")
        crypto = PythonHermesCrypto()
        ciphertext = crypto.encrypt_aead(plaintext)
        recovered = crypto.decrypt_aead(ciphertext)
        assert recovered == plaintext, \
            f"Round-trip fallido para plaintext de {len(plaintext)} bytes"

    @given(
        plaintext=st.binary(min_size=1, max_size=512),
        flip_pos_offset=st.integers(min_value=0, max_value=10),
    )
    @settings(max_examples=200, suppress_health_check=[HealthCheck.too_slow])
    def test_aead_tamper_detection(self, plaintext: bytes, flip_pos_offset: int):
        """Cualquier modificación al ciphertext → None"""
        if not _CRYPTOGRAPHY_AVAILABLE:
            pytest.skip("cryptography package not available")
        crypto = PythonHermesCrypto()
        ciphertext = bytearray(crypto.encrypt_aead(plaintext))

        # Flipear un bit en el ciphertext (después del nonce)
        nonce_size = PythonHermesCrypto.NONCE_SIZE
        tamper_pos = nonce_size + (flip_pos_offset % (len(ciphertext) - nonce_size))
        ciphertext[tamper_pos] ^= 0xFF

        result = crypto.decrypt_aead(bytes(ciphertext))
        assert result is None, \
            f"AES-GCM debe detectar manipulación en byte[{tamper_pos}]"

    def test_aead_nonces_are_unique(self):
        """El mismo plaintext cifrado dos veces debe producir ciphertexts distintos"""
        if not _CRYPTOGRAPHY_AVAILABLE:
            pytest.skip("cryptography package not available")
        crypto = PythonHermesCrypto()
        plaintext = b"mensaje identico cifrado dos veces"
        c1 = crypto.encrypt_aead(plaintext)
        c2 = crypto.encrypt_aead(plaintext)
        assert c1[:12] != c2[:12], "Nonces deben ser únicos"
        assert c1 != c2, "Ciphertexts deben ser distintos"

    def test_aead_cross_key_isolation(self):
        """Ciphertexts de una instancia no son descifrables por otra"""
        if not _CRYPTOGRAPHY_AVAILABLE:
            pytest.skip("cryptography package not available")
        crypto_a = PythonHermesCrypto()
        crypto_b = PythonHermesCrypto()
        ciphertext = crypto_a.encrypt_aead(b"datos secretos de Alice")
        result = crypto_b.decrypt_aead(ciphertext)
        assert result is None, "Bob no debe poder descifrar datos de Alice"

    def test_aead_too_short_ciphertext_returns_none(self):
        """Ciphertext demasiado corto → None, no excepción"""
        if not _CRYPTOGRAPHY_AVAILABLE:
            pytest.skip("cryptography package not available")
        crypto = PythonHermesCrypto()
        result = crypto.decrypt_aead(b"\x00" * 10)  # < 12+16=28 bytes
        assert result is None, "Ciphertext corto debe retornar None"


# ==============================================================================
# Punto de entrada directo (sin pytest)
# ==============================================================================

if __name__ == "__main__":
    import sys
    print("🔬 Ejecutando property-based tests directamente...")
    print("   Usa: pytest tests/property_based/test_crypto_properties.py -v")
    print("   para output completo con Hypothesis.")
    sys.exit(0)
