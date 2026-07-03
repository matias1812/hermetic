#!/bin/bash
# formal_spec/model_checking/run_tlc.sh
#
# Ejecutar TLA+ Model Checker (TLC) en todos los módulos formales de HermesChat.
#
# REQUISITOS:
#   - Java 11+ instalado (verificado: Java 21 disponible en este sistema)
#   - TLC jar: descargar de https://github.com/tlaplus/tlaplus/releases
#     Descarga: tla2tools.jar (~40MB)
#     O via: wget https://github.com/tlaplus/tlaplus/releases/latest/download/tla2tools.jar
#
# USO:
#   bash formal_spec/model_checking/run_tlc.sh
#
# RESULTADOS:
#   formal_spec/model_checking/results/{memory,registry,otp}_verification.txt

set -euo pipefail

TLA_DIR="formal_spec/tlaplus"
RESULTS_DIR="formal_spec/model_checking/results"
TLC_JAR="${TLC_JAR:-tla2tools.jar}"  # Override con variable de entorno si es necesario

mkdir -p "${RESULTS_DIR}"

echo "🔍 Iniciando verificación formal con TLC..."
echo "============================================"
echo "  TLA+ dir:     ${TLA_DIR}"
echo "  Results dir:  ${RESULTS_DIR}"
echo "  TLC jar:      ${TLC_JAR}"
echo ""

# Verificar que Java está disponible
if ! command -v java &> /dev/null; then
    echo "❌ ERROR: Java no encontrado. Instalar Java 11+."
    exit 1
fi
echo "✅ Java: $(java -version 2>&1 | head -1)"

# Verificar que el jar de TLC está disponible
if [ ! -f "${TLC_JAR}" ]; then
    echo ""
    echo "⚠️  TLC jar no encontrado: ${TLC_JAR}"
    echo ""
    echo "Para descargar TLC (requiere conexión a internet):"
    echo "  wget https://github.com/tlaplus/tlaplus/releases/latest/download/tla2tools.jar"
    echo "  # O en Windows PowerShell:"
    echo "  # Invoke-WebRequest -Uri https://github.com/tlaplus/tlaplus/releases/latest/download/tla2tools.jar -OutFile tla2tools.jar"
    echo ""
    echo "Alternativamente, usar TLA+ Toolbox (IDE gráfico):"
    echo "  https://github.com/tlaplus/tlaplus/releases"
    echo ""
    echo "NOTA: Los módulos TLA+ están completos y listos para verificación."
    echo "      Los resultados esperados están en: ${RESULTS_DIR}/EXPECTED_RESULTS.md"
    exit 1
fi

echo ""
echo "📐 Verificando HermesMemory.tla..."
echo "-----------------------------------"
java -jar "${TLC_JAR}" \
    -config "${TLA_DIR}/MC_Memory.cfg" \
    "${TLA_DIR}/HermesMemory.tla" \
    -workers auto \
    2>&1 | tee "${RESULTS_DIR}/memory_verification.txt"

echo ""
echo "📐 Verificando HermesRegistry.tla..."
echo "--------------------------------------"
java -jar "${TLC_JAR}" \
    -config "${TLA_DIR}/MC_Registry.cfg" \
    "${TLA_DIR}/HermesRegistry.tla" \
    -workers auto \
    2>&1 | tee "${RESULTS_DIR}/registry_verification.txt"

echo ""
echo "📐 Verificando HermesOTP.tla (modelo académico)..."
echo "----------------------------------------------------"
java -jar "${TLC_JAR}" \
    -config "${TLA_DIR}/MC_OTP.cfg" \
    "${TLA_DIR}/HermesOTP.tla" \
    -workers auto \
    2>&1 | tee "${RESULTS_DIR}/otp_verification.txt"

echo ""
echo "============================================"
echo "📊 RESUMEN DE VERIFICACIÓN:"
echo "============================================"

for result_file in "${RESULTS_DIR}"/*_verification.txt; do
    module=$(basename "${result_file}" _verification.txt)
    if grep -qi "error\|violation\|deadlock" "${result_file}"; then
        echo "  ❌ ${module}: FALLÓ (ver ${result_file})"
    else
        echo "  ✅ ${module}: SIN VIOLACIONES"
    fi
done

echo ""
echo "✅ Verificación formal completada"
echo "   Resultados en: ${RESULTS_DIR}/"
