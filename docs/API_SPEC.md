# API Specification - HermesChat Backend

## Overview
Este documento describe las rutas REST y WebSocket del backend FastAPI de HermesChat.

## Endpoints REST

### POST /api/register
Registro de llaves públicas del cliente.

Request JSON:
```json
{
  "client_id": "<sha3-256 hex hash>",
  "kyber_pk_hex": "<hex-encoded Kyber public key>",
  "sphincs_pk_hex": "<hex-encoded SPHINCS+ public key>",
  "password": "<legacy optional>"
}
```

Response:
```json
{
  "status": "success",
  "message": "Zero-Knowledge public keys registered successfully."
}
```

### POST /api/login
Genera un token de sesión HMAC para el usuario.

Request JSON:
```json
{
  "client_id": "<sha3-256 hex hash>",
  "password": "<legacy password>",
  "kyber_pk_hex": "<hex>",
  "sphincs_pk_hex": "<hex>"
}
```

Response:
```json
{
  "status": "authenticated",
  "token": "Bearer <id_hash>:<expires_at>:<signature>",
  "expires_in": 28800
}
```

### POST /api/relay
Relevo de envelope cifrado a otro cliente.

Headers:
- `Authorization: Bearer <token>`

Request JSON:
```json
{
  "sender_hash": "<id_hash>",
  "receiver_hash": "<id_hash>",
  "encrypted_blob_hex": "<hex>",
  "session_key_hash": "<hex>",
  "ttl_seconds": 3600,
  "timestamp": 1690000000,
  "signature": "<hex>"
}
```

Response:
```json
{
  "status": "success",
  "blob_id": "ws_delivered" | "<queue_blob_id>",
  "delivered_realtime": true
}
```

### POST /api/backup
Guarda un backup cifrado de usuario.

Headers:
- `Authorization: Bearer <token>`

Request JSON:
```json
{
  "user_hash": "<id_hash>",
  "encrypted_data_hex": "<hex>",
  "backup_id": "<uuid>",
  "backup_type": "<type>",
  "parent_id": "<id or null>",
  "timestamp": 1690000000,
  "signature": "<hex>",
  "version": 1,
  "algorithm": "AES-GCM/Argon2"
}
```

Response:
```json
{ "status": "success" }
```

### POST /api/verify
Verificación de sistema y estado de seguridad.

Response:
```json
{
  "memory_safety": { "name": "Memory Safety / Secure Zeroization Audit", "passed": true, "details": "Rust WASM (ZeroizeOnDrop) memory zeroization verified." },
  "entropy_tests": { "name": "NIST SP 800-22 Entropy Verification Suite", "passed": true, "details": "XChaCha20Poly1305 keystream mask passes statistical checks." },
  "timing_tests": { "name": "Software Constant-Time Verification Audit", "passed": true, "details": "AEAD operations execute in constant time." },
  "perfect_secrecy": { "name": "Shannon Perfect Secrecy Mathematical Demonstration", "passed": true, "details": "Note: Keys are wrapped under X25519/Ed25519, not perfect secrecy." }
}
```

## WebSocket `/ws/{client_id}`

### Conexión
- Origen validado contra `ALLOWED_ORIGINS`.
- Autenticación inicial debe completarse en máximo `5` segundos.

### Handshake de autenticación
Cada cliente debe enviar un mensaje JSON inicial:
```json
{
  "type": "auth",
  "timestamp": 1690000000,
  "signature": "<hex>",
  "show_online": true
}
```

### Reglas de WebSocket
- `MAX_WS_FRAME_SIZE` por defecto: `65536` bytes.
- `WS_MESSAGES_PER_SECOND` por defecto: `10`.
- Los mensajes que excedan el límite de tamaño se cierran con `1009`.
- Mensajes de tasa excesiva se cierran con `1008`.

### Payload válido
#### relay_request
```json
{
  "type": "relay_request",
  "receiver_hash": "<id_hash>",
  "encrypted_blob_hex": "<hex>",
  "session_key_hash": "<hex>"
}
```

#### status_update
```json
{
  "type": "status_update",
  "show_online": true
}
```

### Respuestas WebSocket
- `auth_ok`
- `relayed_blob`
- `ack`
- `error`

## Seguridad WebSocket
- Validación estricta de `Origin`.
- Autenticación antes de aceptar mensajes de relay.
- Tasa de mensajes y tamaño de trama limitado.
- Anti-replay en paquetes con `global_registry.claim_relay_nonce()`.
