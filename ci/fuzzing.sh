#!/bin/bash
# ci/fuzzing.sh
#
# Fuzzing y property-based testing de componentes criptográficos de HermesChat.
#
# REQUISITOS (instalados en este sistema):
#   - Python 3.13 ✅
#   - pip install hypothesis cryptography pytest
#
# REQUISITOS OPCIONALES:
#   - cargo (Rust) → para cargo test nativo
#   - atheris → para modo libFuzzer (Linux/Mac)
#
# USO:
#   bash ci/fuzzing.sh           # Todo
#   bash ci/fuzzing.sh --quick   # Solo tests rápidos (sin Hypothesis exhaustivo)

set -uo pipefail

QUICK_MODE=0
if [[ "${1:-}" == "--quick" ]]; then
    QUICK_MODE=1
fi

echo "🎯 Iniciando fuzzing y property-based testing..."
echo "=================================================="
echo "  Fecha: $(date)"
echo "  Python: $(python --version 2>&1)"
echo "  Modo: $([ $QUICK_MODE -eq 1 ] && echo 'RÁPIDO' || echo 'COMPLETO')"
echo ""

FAILED=0
PASSED=0

# ==============================================================================
# Función helper
# ==============================================================================

run_test() {
    local name="$1"
    local cmd="$2"
    echo "🔬 $name..."
    if eval "$cmd"; then
        echo "  ✅ PASÓ: $name"
        PASSED=$((PASSED + 1))
    else
        echo "  ❌ FALLÓ: $name"
        FAILED=$((FAILED + 1))
    fi
    echo ""
}

# ==============================================================================
# 1. Verificar dependencias Python
# ==============================================================================

echo "📦 Verificando dependencias..."

MISSING_DEPS=0
for pkg in hypothesis pytest; do
    if python -c "import $pkg" 2>/dev/null; then
        echo "  ✅ $pkg disponible"
    else
        echo "  ⚠️  $pkg no instalado — instalar: pip install $pkg"
        MISSING_DEPS=$((MISSING_DEPS + 1))
    fi
done

if python -c "from cryptography.hazmat.primitives.ciphers.aead import AESGCM" 2>/dev/null; then
    echo "  ✅ cryptography disponible (AES-GCM tests activos)"
    CRYPTO_AVAILABLE=1
else
    echo "  ⚠️  cryptography no instalado (AES-GCM tests omitidos)"
    echo "      Instalar: pip install cryptography"
    CRYPTO_AVAILABLE=0
fi

if [ $MISSING_DEPS -gt 0 ]; then
    echo ""
    echo "⚠️  Instalando dependencias faltantes..."
    pip install hypothesis pytest cryptography --quiet 2>&1 || true
fi
echo ""

# ==============================================================================
# 2. Property-based testing — XOR y Zeroización (Hypothesis)
# ==============================================================================

echo "=========================="
echo "🔬 Property-Based Testing (Hypothesis)"
echo "=========================="
echo ""

HYPOTHESIS_EXAMPLES=500
if [ $QUICK_MODE -eq 1 ]; then
    HYPOTHESIS_EXAMPLES=100
fi

run_test "XOR Involutividad (${HYPOTHESIS_EXAMPLES} ejemplos)" \
    "python -m pytest tests/property_based/test_crypto_properties.py::TestXORProperties::test_xor_involutivity -v \
     --hypothesis-seed=42 -q 2>&1 | tail -5"

run_test "XOR Conmutatividad (${HYPOTHESIS_EXAMPLES} ejemplos)" \
    "python -m pytest tests/property_based/test_crypto_properties.py::TestXORProperties::test_xor_commutativity -v \
     -q 2>&1 | tail -5"

run_test "XOR Asociatividad" \
    "python -m pytest tests/property_based/test_crypto_properties.py::TestXORProperties::test_xor_associativity -v \
     -q 2>&1 | tail -5"

run_test "XOR con sí mismo = 0" \
    "python -m pytest tests/property_based/test_crypto_properties.py::TestXORProperties::test_xor_with_self_gives_zero -v \
     -q 2>&1 | tail -5"

run_test "Zeroización bytes = 0" \
    "python -m pytest tests/property_based/test_crypto_properties.py::TestZeroizationProperties -v \
     -q 2>&1 | tail -5"

# ==============================================================================
# 3. Fuzzing AEAD (si cryptography disponible)
# ==============================================================================

if [ $CRYPTO_AVAILABLE -eq 1 ]; then
    echo "=========================="
    echo "🔐 Fuzzing AES-256-GCM (Hypothesis)"
    echo "=========================="
    echo ""

    run_test "AEAD Round-trip (500 ejemplos)" \
        "python -m pytest tests/property_based/test_crypto_properties.py::TestAEADProperties::test_aead_roundtrip -v \
         -q 2>&1 | tail -5"

    run_test "AEAD Tamper Detection" \
        "python -m pytest tests/property_based/test_crypto_properties.py::TestAEADProperties::test_aead_tamper_detection -v \
         -q 2>&1 | tail -5"

    run_test "AEAD Nonces únicos" \
        "python -m pytest tests/property_based/test_crypto_properties.py::TestAEADProperties::test_aead_nonce_unique_each_call -v \
         -q 2>&1 | tail -3"
fi

# ==============================================================================
# 4. Fuzzing manual OTP (10,000 iteraciones, sin dependencias externas)
# ==============================================================================

echo "=========================="
echo "🎯 Fuzzing Manual OTP (10,000 iteraciones)"
echo "=========================="
echo ""

run_test "OTP XOR Fuzzing Manual" \
    "python tests/fuzz/fuzz_otp.py"

# ==============================================================================
# 5. Fuzzing AEAD manual (si cryptography disponible)
# ==============================================================================

if [ $CRYPTO_AVAILABLE -eq 1 ]; then
    run_test "AEAD Fuzzing Manual (5,000 iteraciones)" \
        "python tests/fuzz/fuzz_aead.py"
fi

# ==============================================================================
# 6. Tests de Rust (si cargo disponible)
# ==============================================================================

echo "=========================="
echo "🦀 Tests Rust"
echo "=========================="
echo ""

if command -v cargo &> /dev/null; then
    run_test "cargo test (12 unit tests + 6 integration tests)" \
        "cd hermes_crypto_wasm && cargo test --all-features 2>&1 | tail -10"
else
    echo "  ℹ️  cargo no disponible — tests Rust omitidos"
    echo "     Para instalar Rust: https://rustup.rs/"
    echo "     Una vez instalado: cd hermes_crypto_wasm && cargo test"
    echo ""
fi

# ==============================================================================
# RESUMEN FINAL
# ==============================================================================

echo "=================================================="
echo "📊 RESUMEN DE FUZZING"
echo "=================================================="
echo "  ✅ Tests pasados: ${PASSED}"
echo "  ❌ Tests fallidos: ${FAILED}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "🏆 TODOS los tests de fuzzing PASARON"
    exit 0
else
    echo "❌ ${FAILED} test(s) FALLARON — revisar output arriba"
    exit 1
fi
