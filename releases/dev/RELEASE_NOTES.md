# HermesChat vdev

## Fecha de Release
2026-07-01T06:52:56Z

## Artefactos
| Archivo | SHA256 | Firma |
|---------|--------|-------|
| hermes_crypto_wasm_bg.wasm | 2b91b34630f2d16c8d0d344b2f90e24226cea9b4dabaaa360bd1433c62e5d3f8 | ✅ |
| bundle.js | a88dc22e737bae2d9b7856730604f8de71d3a25aa163554fd40b64f42dc2d6fe | ✅ |

## Verificación
```bash
# Verificar firma
cosign verify-blob --key hermeschat.pub \
    --signature hermes_crypto_wasm_bg.wasm.sig \
    hermes_crypto_wasm_bg.wasm

# Verificar checksum
sha256sum -c SHA256SUMS
```

## SBOM
Ver `sbom.json` para lista completa de dependencias.

## Notas de Seguridad
- Esta release incluye 22 correcciones de seguridad
- Ver `CHANGELOG.md` para detalles
