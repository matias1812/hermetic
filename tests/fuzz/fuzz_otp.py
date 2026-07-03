#!/usr/bin/env python3
"""
tests/fuzz/fuzz_otp.py

Fuzzer para operaciones OTP/XOR de HermesChat.
Usa Hypothesis como motor de fuzzing (modo property-based).
Compatible con atheris si está disponible (modo libFuzzer).

MODOS DE EJECUCIÓN:
    # Modo 1: Hypothesis (funciona en Python 3.13, sin atheris)
    pytest tests/fuzz/fuzz_otp.py -v

    # Modo 2: atheris (si disponible — Linux/Mac)
    pip install atheris
    python tests/fuzz/fuzz_otp.py

PROPIEDADES FUZZADAS:
    - Involutividad XOR: A ^ B ^ B = A para cualquier longitud/valor
    - Detección de longitud: XOR con longitudes distintas siempre falla
    - Zeroización: Datos zeroizados siempre son 0
    - No-overflow: XOR nunca desborda más allá del tamaño de salida
"""

import sys
import hashlib
import os

# ==============================================================================
# Implementación de referencia para fuzzing
# ==============================================================================

def constant_time_xor(a: bytes, b: bytes) -> bytes:
    """Operación XOR en tiempo constante (referencia Python de lib.rs)"""
    if len(a) != len(b):
        raise ValueError(f"Length mismatch: {len(a)} != {len(b)}")
    return bytes(x ^ y for x, y in zip(a, b))


def secure_zeroize(buf: bytearray) -> bool:
    """Zeroización con verificación SHA3-256 (referencia Python de lib.rs)"""
    if not buf:
        return True
    orig_hash = hashlib.sha3_256(bytes(buf)).digest()
    for i in range(len(buf)):
        buf[i] = 0
    new_hash = hashlib.sha3_256(bytes(buf)).digest()
    return orig_hash != new_hash and all(b == 0 for b in buf)


# ==============================================================================
# MODO ATHERIS (libFuzzer — Linux/Mac)
# ==============================================================================

def TestOneInput(data: bytes) -> None:
    """
    Función principal de fuzzing para atheris/libFuzzer.
    Recibe bytes aleatorios de atheris y verifica propiedades criptográficas.
    """
    if len(data) < 16:
        return  # Input mínimo para dividir en plaintext + key

    # Dividir el input en dos partes iguales
    half = len(data) // 2
    plaintext = data[:half]
    key = data[half:half * 2]

    # Propiedad 1: Involutividad XOR
    try:
        ciphertext = constant_time_xor(plaintext, key)
        decrypted = constant_time_xor(ciphertext, key)
        assert plaintext == decrypted, \
            f"FUZZING VIOLATION: XOR involutivity failed for len={len(plaintext)}"
    except ValueError as e:
        if "Length mismatch" not in str(e):
            raise  # Solo permitir ValueError de longitud

    # Propiedad 2: Zeroización verificable
    key_buf = bytearray(key)
    result = secure_zeroize(key_buf)
    assert result, "FUZZING VIOLATION: secure_zeroize returned False"
    assert all(b == 0 for b in key_buf), \
        "FUZZING VIOLATION: Not all bytes are 0 after zeroize"

    # Propiedad 3: XOR con longitud diferente siempre lanza ValueError
    if len(plaintext) > 0:
        different_len = bytes(len(plaintext) + 1)
        try:
            constant_time_xor(plaintext, different_len)
            raise AssertionError(
                "FUZZING VIOLATION: XOR with different lengths should raise ValueError"
            )
        except ValueError:
            pass  # Esperado

    # Propiedad 4: XOR con sí mismo da cero
    if len(plaintext) > 0:
        self_xor = constant_time_xor(plaintext, plaintext)
        assert all(b == 0 for b in self_xor), \
            "FUZZING VIOLATION: A ^ A should be all zeros"

    # Propiedad 5: XOR con cero es identidad
    if len(plaintext) > 0:
        zeros = bytes(len(plaintext))
        identity = constant_time_xor(plaintext, zeros)
        assert identity == plaintext, \
            "FUZZING VIOLATION: A ^ 0 should equal A"


# ==============================================================================
# MODO HYPOTHESIS (property-based testing — funciona sin atheris)
# ==============================================================================

try:
    from hypothesis import given, settings, assume
    from hypothesis import strategies as st
    import pytest

    class TestFuzzOTPHypothesis:
        """Tests de fuzzing con Hypothesis (motor: Python, sin atheris)."""

        @given(data=st.binary(min_size=16, max_size=2048))
        @settings(max_examples=1000)
        def test_xor_involutivity_fuzz(self, data: bytes):
            """Fuzzing de involutividad XOR con hasta 1000 ejemplos Hypothesis"""
            half = len(data) // 2
            plaintext = data[:half]
            key = data[half:half * 2]
            if len(plaintext) == 0:
                return
            ciphertext = constant_time_xor(plaintext, key)
            decrypted = constant_time_xor(ciphertext, key)
            assert plaintext == decrypted

        @given(data=st.binary(min_size=1, max_size=4096))
        @settings(max_examples=500)
        def test_zeroize_fuzz(self, data: bytes):
            """Fuzzing de zeroización para cualquier tamaño de buffer"""
            buf = bytearray(data)
            assume(len(buf) > 0)
            secure_zeroize(buf)
            assert all(b == 0 for b in buf)

        @given(
            a=st.binary(min_size=1, max_size=512),
            extra=st.binary(min_size=1, max_size=10),
        )
        @settings(max_examples=300)
        def test_xor_length_mismatch_always_raises(self, a: bytes, extra: bytes):
            """XOR con longitudes distintas siempre lanza ValueError"""
            b = a + extra  # b es siempre más largo que a
            with pytest.raises(ValueError):
                constant_time_xor(a, b)

    _HYPOTHESIS_AVAILABLE = True

except ImportError:
    _HYPOTHESIS_AVAILABLE = False


# ==============================================================================
# Punto de entrada
# ==============================================================================

if __name__ == "__main__":
    # Intentar modo atheris primero
    try:
        import atheris
        print("🎯 Modo atheris (libFuzzer) — iniciando fuzzing...")
        atheris.Setup(sys.argv, TestOneInput)
        atheris.Fuzz()

    except ImportError:
        # Fallback a modo manual con datos aleatorios
        print("[WARNING] atheris no disponible. Ejecutando fuzzing manual con datos aleatorios.")
        print("   Para property-based testing completo: pytest tests/fuzz/fuzz_otp.py")
        print("")

        import random
        n_tests = 10_000
        violations = 0

        for i in range(n_tests):
            size = random.randint(16, 1024)
            data = bytes(random.getrandbits(8) for _ in range(size))
            try:
                TestOneInput(data)
            except AssertionError as e:
                print(f"[FAIL] VIOLATION at test {i}: {e}")
                violations += 1

        if violations == 0:
            print(f"[PASS] {n_tests:,} tests pasados sin violaciones")
        else:
            print(f"[FAIL] {violations} violaciones encontradas de {n_tests} tests")
            sys.exit(1)
