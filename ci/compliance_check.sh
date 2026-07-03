#!/bin/bash
# Verificación de cumplimiento para preparación CC

echo "📋 Verificando cumplimiento Common Criteria..."
echo "=============================================="

ISSUES=0

# 1. Verificar especificación formal existe
if [ ! -f "formal_spec/tlaplus/HermesOTP.tla" ]; then
    echo "❌ FALTA: Especificación formal OTP (TLA+)"
    ISSUES=$((ISSUES + 1))
fi

# 2. Verificar model checking
if [ ! -f "formal_spec/model_checking/run_tlc.sh" ]; then
    echo "❌ FALTA: Script de model checking"
    ISSUES=$((ISSUES + 1))
fi

# 3. Verificar trazabilidad
if command -v python3 &>/dev/null; then
    python3 traceability/traceability.py
elif command -v py &>/dev/null; then
    py traceability/traceability.py
else
    python traceability/traceability.py
fi
if [ $? -ne 0 ]; then
    echo "❌ FALLA: Trazabilidad incompleta"
    ISSUES=$((ISSUES + 1))
fi

# 4. Verificar documentación
for doc in \
    "docs/formal/FUNCTIONAL_SPEC.md" \
    "docs/formal/HIGH_LEVEL_DESIGN.md" \
    "docs/formal/THREAT_MODEL.md" \
    "docs/formal/SECURITY_TARGET.md" \
    "docs/evidence/TRACEABILITY_MATRIX.md"; do
    if [ ! -f "$doc" ]; then
        echo "❌ FALTA: Documento requerido: $doc"
        ISSUES=$((ISSUES + 1))
    fi
done

# 5. Verificar análisis estático ejecutado
if [ ! -f "codeql-results.sarif" ] && [ ! -f "bandit-results.json" ]; then
    echo "❌ FALTA: Resultados de análisis estático"
    ISSUES=$((ISSUES + 1))
fi

echo "=============================================="
if [ $ISSUES -eq 0 ]; then
    echo "✅ TODAS LAS VERIFICACIONES SUPERADAS"
    echo "✅ Sistema preparado para evaluación CC EAL4+"
else
    echo "❌ $ISSUES problemas encontrados"
    echo "❌ NO está listo para evaluación"
fi

exit $ISSUES
