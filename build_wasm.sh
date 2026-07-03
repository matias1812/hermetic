#!/bin/bash
set -e

echo "🔨 Building WASM..."
cd hermes_crypto_wasm
wasm-pack build --target web

echo "🔐 Generating integrity hash..."
# We use sha256sum to generate the hash of the built wasm file
WASM_HASH=$(sha256sum pkg/hermes_crypto_wasm_bg.wasm | cut -d' ' -f1)

echo "📝 Writing manifest..."
cat > pkg/manifest.json << EOF
{
  "version": "$(cat Cargo.toml | grep version | head -1 | cut -d'"' -f2)",
  "wasm_hash": "$WASM_HASH",
  "built_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# Copy the built pkg to frontend/src/wasm so Vite can import it and bundle it properly
echo "📦 Copying to frontend..."
mkdir -p ../frontend/src/wasm
cp -r pkg/* ../frontend/src/wasm/

# Copy the manifest to frontend src so we can import it
echo "export const WASM_EXPECTED_HASH = '$WASM_HASH';" > ../frontend/src/js/wasm_hash.js

echo "✅ Build complete. Hash: $WASM_HASH"
