# Dockerfile para Reproducible Builds (HermesChat WASM Core)
# Utiliza Debian base y fija las dependencias para garantizar hash determinista
FROM rust:1.80-slim-bullseye AS builder

# Instalar dependencias necesarias
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    pkg-config \
    libssl-dev \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Instalar wasm-pack y wasm-opt fijando versiones para reproducibilidad
RUN cargo install wasm-pack --version 0.12.1
RUN cargo install wasm-opt --version 0.116.1

# Establecer target
RUN rustup target add wasm32-unknown-unknown

WORKDIR /app

# Copiar el manifiesto para cacheo
COPY hermes_crypto_wasm/Cargo.toml hermes_crypto_wasm/Cargo.lock* ./hermes_crypto_wasm/

# Copiar código fuente
COPY hermes_crypto_wasm/src ./hermes_crypto_wasm/src
COPY hermes_crypto_wasm/tests ./hermes_crypto_wasm/tests

WORKDIR /app/hermes_crypto_wasm

# Compilar en modo release y empaquetar
# --no-typescript si es puramente FFI interno (opcional)
RUN wasm-pack build --target web --out-dir pkg --release

# Script de verificación de hash
RUN sha256sum pkg/hermes_crypto_wasm_bg.wasm > pkg/checksum.sha256

# Imagen de salida ligera (solo para extraer el artefacto)
FROM scratch AS export
COPY --from=builder /app/hermes_crypto_wasm/pkg /pkg

# Instrucciones de uso (Desde host):
# DOCKER_BUILDKIT=1 docker build --output out/ .
# cat out/pkg/checksum.sha256
