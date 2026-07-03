#!/usr/bin/env python3
"""
tests/fuzz/fuzz_aead.py

Fuzzer para operaciones AES-256-GCM de HermesChat.
Verifica propiedades de autenticación e integridad.

MODOS DE EJECUCIÓN:
    # Con cryptography instalada (recomendado):
    pip install cryptography hypothesis pytest
    pytest tests/fuzz/fuzz_aead.py -v

    # Modo manual (sin dependencias externas):
    python tests/fuzz/fuzz_aead.py

PROPIEDADES FUZZADAS:
    - Round-trip: decrypt(encrypt(p, k), k) = p para todo p, k
    - Tamper detection: decrypt(flip_bit(encrypt(p, k)), k) = None
    - Nonce uniqueness: encrypt dos veces → nonces distintos
    - Cross-key isolation: decrypt con clave distinta = None
    - Short ciphertext: ciphertext < 28 bytes → None (no panic)
    - Empty plaintext: encrypt(b"") es válido y reversible
"""

import sys
import os
import struct
import random
import hashlib

# ==============================================================================
# Implementación de referencia AES-256-GCM
# ==============================================================================

NONCE_SIZE = 12  # 96 bits
TAG_SIZE = 16    # 128 bits

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    _CRYPTO_AVAILABLE = True
except ImportError:
    _CRYPTO_AVAILABLE = False


class ReferenceAEAD:
    """
    Implementación de referencia AES-256-GCM para fuzzing.
    Espeja el comportamiento de HermesCrypto::encrypt_aead / decrypt_aead en lib.rs.
    """

    def __init__(self, key: bytes = None):
        self.key = key or os.urandom(32)
        self._nonce_counter = 0

    def encrypt(self, plaintext: bytes) -> bytes:
        if not _CRYPTO_AVAILABLE:
            raise RuntimeError("cryptography package not available")

        nonce = struct.pack('>Q', self._nonce_counter) + b'\x00' * 4
        self._nonce_counter += 1

        aesgcm = AESGCM(self.key)
        ciphertext = aesgcm.encrypt(nonce, plaintext, None)
        return nonce + ciphertext

    def decrypt(self, data: bytes):
        if not _CRYPTO_AVAILABLE:
            raise RuntimeError("cryptography package not available")

        if len(data) < NONCE_SIZE + TAG_SIZE:
            return None

        nonce = data[:NONCE_SIZE]
        ciphertext = data[NONCE_SIZE:]

        try:
            aesgcm = AESGCM(self.key)
            return aesgcm.decrypt(nonce, ciphertext, None)
        except Exception:
            return None


# ==============================================================================
# Función principal de fuzzing (compatible con atheris)
# ==============================================================================

def TestOneInputAEAD(data: bytes) -> None:
    """
    Fuzzer AEAD: recibe bytes del motor y verifica propiedades.
    Compatible con atheris.Setup() o ejecución manual.
    """
    if not _CRYPTO_AVAILABLE:
        return  # No podemos fuzzear sin la librería crypto

    # Necesitamos al menos 32 bytes de clave + algo de plaintext
    if len(data) < 33:
        return

    # Usar los primeros 32 bytes como clave de test
    key = data[:32]
    plaintext = data[32:]

    crypto = ReferenceAEAD(key=key)

    # Propiedad 1: Round-trip básico
    try:
        ciphertext = crypto.encrypt(plaintext)
        recovered = crypto.decrypt(ciphertext)
        assert recovered == plaintext, \
            f"AEAD VIOLATION: round-trip failed, plaintext len={len(plaintext)}"
    except Exception as e:
        if "not available" not in str(e):
            raise

    # Propiedad 2: Tamper detection (flipear byte en ciphertext)
    if len(ciphertext) > NONCE_SIZE:
        tampered = bytearray(ciphertext)
        flip_pos = NONCE_SIZE + (len(data) % max(1, len(ciphertext) - NONCE_SIZE))
        flip_pos = min(flip_pos, len(tampered) - 1)
        tampered[flip_pos] ^= 0xFF
        result = crypto.decrypt(bytes(tampered))
        assert result is None, \
            f"AEAD VIOLATION: tamper detection failed at byte {flip_pos}"

    # Propiedad 3: Ciphertext demasiado corto → None, no excepción
    for short_len in [0, 1, 10, 27]:
        result = crypto.decrypt(plaintext[:short_len])  # plaintext como "ciphertext"
        # No debe lanzar — debe retornar None
        # (el assert es que llegamos aquí sin excepción)

    # Propiedad 4: Cross-key isolation
    other_key = bytes(b ^ 0xFF for b in key)  # Clave completamente diferente
    crypto_other = ReferenceAEAD(key=other_key)
    result = crypto_other.decrypt(ciphertext)
    assert result is None, \
        "AEAD VIOLATION: cross-key isolation failed — different key decrypted ciphertext"


# ==============================================================================
# Tests Hypothesis (modo pytest)
# ==============================================================================

try:
    from hypothesis import given, settings, assume, HealthCheck
    from hypothesis import strategies as st
    import pytest

    class TestFuzzAEADHypothesis:
        """Property-based fuzzing de AES-256-GCM con Hypothesis."""

        @given(plaintext=st.binary(min_size=0, max_size=1024))
        @settings(max_examples=500, suppress_health_check=[HealthCheck.too_slow])
        def test_aead_roundtrip_fuzz(self, plaintext: bytes):
            """AES-GCM round-trip para cualquier longitud de plaintext"""
            if not _CRYPTO_AVAILABLE:
                pytest.skip("cryptography not available")
            crypto = ReferenceAEAD()
            ct = crypto.encrypt(plaintext)
            pt = crypto.decrypt(ct)
            assert pt == plaintext

        @given(
            plaintext=st.binary(min_size=1, max_size=512),
            flip_byte=st.integers(min_value=0, max_value=255),
            flip_offset=st.integers(min_value=0, max_value=100),
        )
        @settings(max_examples=500, suppress_health_check=[HealthCheck.too_slow])
        def test_aead_tamper_detection_fuzz(self, plaintext, flip_byte, flip_offset):
            """AES-GCM detecta manipulación en cualquier byte"""
            if not _CRYPTO_AVAILABLE:
                pytest.skip("cryptography not available")
            crypto = ReferenceAEAD()
            ct = bytearray(crypto.encrypt(plaintext))
            pos = NONCE_SIZE + (flip_offset % max(1, len(ct) - NONCE_SIZE))
            ct[pos] ^= (flip_byte | 0x01)  # Asegurar que el flip es no-nulo
            result = crypto.decrypt(bytes(ct))
            assert result is None, f"Tamper en byte[{pos}] no detectado"

        @given(plaintext=st.binary(min_size=0, max_size=256))
        @settings(max_examples=200)
        def test_aead_nonce_unique_each_call(self, plaintext: bytes):
            """Cada cifrado usa un nonce distinto"""
            if not _CRYPTO_AVAILABLE:
                pytest.skip("cryptography not available")
            crypto = ReferenceAEAD()
            c1 = crypto.encrypt(plaintext)
            c2 = crypto.encrypt(plaintext)
            assert c1[:NONCE_SIZE] != c2[:NONCE_SIZE], "Nonces deben diferir"

        @given(short_data=st.binary(max_size=27))
        @settings(max_examples=200)
        def test_aead_short_ciphertext_returns_none(self, short_data: bytes):
            """Ciphertext < 28 bytes → None (no excepción)"""
            if not _CRYPTO_AVAILABLE:
                pytest.skip("cryptography not available")
            crypto = ReferenceAEAD()
            result = crypto.decrypt(short_data)
            assert result is None

    _HYPOTHESIS_AVAILABLE = True

except ImportError:
    _HYPOTHESIS_AVAILABLE = False


# ==============================================================================
# Punto de entrada
# ==============================================================================

if __name__ == "__main__":
    if not _CRYPTO_AVAILABLE:
        print("⚠️  cryptography package no disponible.")
        print("   Instalar: pip install cryptography")
        sys.exit(0)

    # Intentar atheris
    try:
        import atheris
        print("🎯 Modo atheris — fuzzing AEAD...")
        atheris.Setup(sys.argv, TestOneInputAEAD)
        atheris.Fuzz()
    except ImportError:
        # Modo manual
        print("🔬 Modo manual — fuzzing AEAD con datos aleatorios...")
        n_tests = 5_000
        violations = 0

        for i in range(n_tests):
            size = random.randint(33, 512)
            data = os.urandom(size)
            try:
                TestOneInputAEAD(data)
            except AssertionError as e:
                print(f"❌ VIOLATION at test {i}: {e}")
                violations += 1

        if violations == 0:
            print(f"✅ {n_tests:,} AEAD tests pasados sin violaciones")
        else:
            print(f"❌ {violations} violaciones de {n_tests} tests")
            sys.exit(1)
