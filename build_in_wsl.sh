#!/bin/bash
set -e
source ~/.cargo/env
cd /mnt/c/Users/matia/OneDrive/Desktop/hermeticos/hermes_crypto_wasm
wasm-pack build --target web --release

WASM_BIN="pkg/hermes_crypto_wasm_bg.wasm"
WASM_HASH=$(sha256sum "$WASM_BIN" | cut -d' ' -f1)
echo "export const WASM_EXPECTED_HASH = '$WASM_HASH';" > ../frontend/src/js/wasm_hash.js

echo "Copiando binarios al directorio frontend/src/wasm..."
mkdir -p ../frontend/src/wasm
cp -r pkg/* ../frontend/src/wasm/

echo "Success! WASM built, hash updated ($WASM_HASH), and files copied to frontend."
