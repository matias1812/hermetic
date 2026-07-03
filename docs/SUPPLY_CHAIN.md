# Integridad de la Cadena de Suministro - HermesChat

## Implementado ✅
- Cargo.lock versionado y dependencias fijadas.
- `cargo vet` para dependencias críticas (estructural).
- **Reproducible Builds**: Entorno de compilación determinista vía `Dockerfile` (`rust:1.80-slim-bullseye`).
- **SBOM (Software Bill of Materials)**: Generación automática con `cargo-cyclonedx` en cada commit.
- **CI/CD Security Pipeline**: GitHub Actions validando lints, fuzzer nocturno y compilación.

## Pendiente ⏳
- Firmado de artefactos mediante Sigstore (Cosign).
- Atestación SLSA Level 3 (Generación de procedencia in-pipeline).
- Verificación de integridad de WASM en cliente (checksum TLS/Subresource Integrity).
