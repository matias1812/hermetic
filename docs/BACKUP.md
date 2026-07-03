# Formato de Backup - HermesChat

## Estructura
```json
{
  "version": "1.0.0",
  "timestamp": 1719876543,
  "checksum": "sha256:abcd...",
  "signature": "ed25519:efgh...",
  "data": { ... }
}
```

## Verificación
1. SHA256 checksum
2. Firma Ed25519
3. Versión compatible
4. Integridad de datos descifrados

## Compatibilidad
- v1.0 → v1.1: Automática (campos añadidos)
- v1.0 → v2.0: NO compatible (cambio de algoritmo)
