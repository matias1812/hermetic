# Integridad de la Cadena de Suministro - HermesChat

## Implementado ✅
- Cargo.lock versionado y dependencias fijadas.
- `cargo vet` para dependencias críticas (estructural).
- **SBOM (Software Bill of Materials)**: Implementado en CI (Generación automática con `cargo-cyclonedx` en cada commit).
- **Reproducible Builds (Infraestructura)**: Entorno de compilación determinista configurado en `Dockerfile` (`rust:1.80-slim-bullseye`); verificación mediante reconstrucción independiente cruzada en progreso.
- **CI/CD Security Pipeline**: GitHub Actions validando lints, fuzzer nocturno y compilación.
- **Verificación de Integridad en Runtime**: El cliente verifica dinámicamente el digest SHA-256 del módulo WASM (`crypto_wasm_bridge.js`) abortando si difiere del hash de compilación.

## Pendiente ⏳
- Firmado de artefactos mediante Sigstore (Cosign).
- Atestación SLSA Level 3 (Generación de procedencia in-pipeline).
