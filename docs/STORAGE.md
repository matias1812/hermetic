# Almacenamiento Local - HermesChat

## IndexedDB
- Nombre: HermesDB
- Versión: 1
- Almacenes: vault, messages, sessions, groups, backups

## Qué se almacena
✅ Ciphertext
✅ Metadata mínima (timestamp, remitente, destinatario)

## Qué NO se almacena
❌ Root Key
❌ Chain Key
❌ Message Key
❌ Shared Secret
❌ Identity Private Key

## Web Locks
- Recursos: vault, ratchet, backup, storage
- Timeout: 5 segundos
- Fallback: IndexedDB transacciones

## Auto Backup
- Frecuencia: cada 24 horas
- Retención: últimos 30 backups
- Cifrado: XChaCha20Poly1305
