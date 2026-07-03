#!/bin/bash
# Analisis estatico de HermesChat v3.0
#
# Este script ejecuta las herramientas disponibles.
# Si una herramienta no esta instalada, lo reporta explicitamente
# en lugar de saltear silenciosamente (que daria falsa confianza).
#
# Para instalar herramientas de analisis:
#   pip install bandit mypy ruff

set -e

PASS=0
FAIL=0
NOT_INSTALLED=0

check_tool() {
    command -v "$1" &>/dev/null
}

echo "==================================================="
echo "  HermesChat v3.0 — Analisis Estatico"
echo "==================================================="

# 1. Bandit — seguridad Python
echo ""
echo "[1/4] Bandit (seguridad Python)"
if check_tool bandit; then
    bandit -r hermes_backend/ -ll -o bandit-results.json -f json
    echo "  PASS: Bandit ejecutado. Ver bandit-results.json"
    PASS=$((PASS+1))
else
    echo "  NOT_INSTALLED: bandit no encontrado. Instalar con: pip install bandit"
    NOT_INSTALLED=$((NOT_INSTALLED+1))
fi

# 2. Mypy — tipado estatico
echo ""
echo "[2/4] Mypy (tipado estatico)"
if check_tool mypy; then
    mypy hermes_backend/ --ignore-missing-imports --no-strict-optional
    echo "  PASS: Mypy ejecutado"
    PASS=$((PASS+1))
else
    echo "  NOT_INSTALLED: mypy no encontrado. Instalar con: pip install mypy"
    NOT_INSTALLED=$((NOT_INSTALLED+1))
fi

# 3. Ruff — linter rapido
echo ""
echo "[3/4] Ruff (linter)"
if check_tool ruff; then
    ruff check hermes_backend/
    echo "  PASS: Ruff ejecutado"
    PASS=$((PASS+1))
else
    echo "  NOT_INSTALLED: ruff no encontrado. Instalar con: pip install ruff"
    NOT_INSTALLED=$((NOT_INSTALLED+1))
fi

# 4. Trazabilidad — siempre se ejecuta
echo ""
echo "[4/4] Trazabilidad de requisitos"
if python traceability/traceability.py; then
    echo "  PASS: Trazabilidad OK"
    PASS=$((PASS+1))
else
    echo "  FAIL: Trazabilidad fallo"
    FAIL=$((FAIL+1))
fi

echo ""
echo "==================================================="
echo "  Resumen: PASS=$PASS  FAIL=$FAIL  NOT_INSTALLED=$NOT_INSTALLED"
if [ $FAIL -gt 0 ]; then
    echo "  RESULTADO: FALLO (ver errores arriba)"
    exit 1
elif [ $NOT_INSTALLED -gt 0 ]; then
    echo "  RESULTADO: INCOMPLETO (instalar herramientas faltantes)"
    exit 2
else
    echo "  RESULTADO: COMPLETO"
    exit 0
fi
