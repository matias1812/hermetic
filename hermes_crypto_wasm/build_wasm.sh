#!/bin/bash
set -e

echo "Compilando hermes_crypto_wasm..."
wasm-pack build --target web --release

# Generar hash del binario compilado
WASM_BIN="pkg/hermes_crypto_wasm_bg.wasm"
if [ -f "$WASM_BIN" ]; then
    mkdir -p ../frontend/src/wasm
    cp -r pkg/* ../frontend/src/wasm/
    WASM_HASH=$(sha256sum "$WASM_BIN" | cut -d' ' -f1)
    echo "export const WASM_EXPECTED_HASH = '$WASM_HASH';" > ../frontend/src/js/wasm_hash.js
    echo "Hash WASM generado: $WASM_HASH"
else
    echo "Error: Binario WASM no encontrado en $WASM_BIN"
    exit 1
fi
