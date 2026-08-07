# Arquitectura - HermesChat

## Visión General
```text
┌─────────────────────────────────────────────────────────┐
│                 Navegador (Frontend)                   │
│  ┌───────────────────────────────────────────────────┐  │
│  │                    UI + Vite                     │  │
│  └───────────────────────────────────────────────────┘  │
│                          │                              │
│  ┌───────────────────────────────────────────────────┐  │
│  │                HermesBridge (FFI)                 │  │
│  └───────────────────────────────────────────────────┘  │
│                          │                              │
│  ┌───────────────────────────────────────────────────┐  │
│  │               HermesCore (Rust/WASM)              │  │
│  │  - IdentityManager                                │  │
│  │  - SessionManager                                 │  │
│  │  - RatchetManager                                 │  │
│  │  - GroupManager                                   │  │
│  │  - BackupManager                                  │  │
│  │  - VaultEngine                                    │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket / HTTP
                              ▼
┌─────────────────────────────────────────────────────────┐
│                 Backend (Python/FastAPI)               │
│  - Blind Relay                                          │
│  - API hardening                                        │
│  - Replay protection                                    │
│  - Log sanitization                                     │
└─────────────────────────────────────────────────────────┐
```

## Arquitectura Actual
HermesChat separa estrictamente los ámbitos de confianza:

- **Cliente**: ejecuta el cifrado real y mantiene llaves privadas.
- **Bridge/FFI**: expone operaciones transaccionales de alto nivel (`seal_message`, `open_message`, `backup`, `restore`).
- **Backend**: sirve como blind relay de paquetes cifrados y no almacena secretos de sesión.

El backend FastAPI gestiona:
- registro de llaves públicas.
- autenticación por token HMAC + firmas SPHINCS+.
- relevo de envelopes cifrados a través de WebSocket y colas temporales.
- políticas de seguridad HTTP/CORS y límites de payload.

## Pilas Criptográficas Reales
| Componente | Implementación actual | Papel |
|---|---|---|
| KEM Post-Cuántico | `Kyber ML-KEM-1024` via `pqcrypto.kem.ml_kem_1024` | Intercambio de secreto compartido para AES |
| Firmas | `SPHINCS+` via `SphincsManager` | Autenticación de paquetes y anti-replay |
| Derivación | `HKDF-SHA512` | Generación de llave AES-256 |
| AEAD | `AES-256-GCM` | Cifrado de mensaje final y autenticidad |
| Zeroization | `safe_zeroize()` en Python | Limpia buffers sensibles del heap |

## Ciclo de Vida del Envelope PQC
1. El cliente construye un envelope con:
   - `kyber_ciphertext`
   - `aes_nonce`
   - `encrypted_message`
   - `signature`
2. El backend recibe el `encrypted_blob_hex` y verifica el remitente.
3. El backend intenta enviar en vivo por `/ws/{client_id}`.
4. Si el destinatario no está en línea, el blob se almacena en una cola RAM temporal.
5. El receptor obtiene el blob y lo descifra localmente con su clave Kyber y SPHINCS+.

## Flujo de Sesión WebSocket `/ws/{client_id}`
Los clientes WS deben cumplir las siguientes reglas:
- `Origin` debe estar presente y ser permitido por `ALLOWED_ORIGINS`.
- Autenticación inicial dentro de `WS_AUTH_TIMEOUT_SECONDS` (por defecto `5.0s`).
- Cada frame está limitado a `WS_MAX_FRAME_SIZE` (por defecto `65536` bytes).
- La tasa de mensajes permitida es `WS_MESSAGES_PER_SECOND` (por defecto `10`).

### Mensaje de handshake
```json
{
  "type": "auth",
  "timestamp": 1690000000,
  "signature": "<hex-encoded SPHINCS+ signature>",
  "show_online": true
}
```

### Mensajes activos
- `relay_request`
- `status_update`

### Protección anti-replay WS
El backend usa `global_registry.claim_relay_nonce()` y `commit_relay_nonce()` para garantizar que cada paquete se procese al menos una vez.

## Comportamiento de Fallback
Si `hermes_ffi` no está disponible, el repositorio puede ejecutar un fallback Python usando `pqcrypto` para Kyber y SPHINCS+. Para despliegues productivos, se recomienda compilar el puente Rust/WASM.

## Referencias
- `hermes_backend/network_core/api.py`
- `hermes_backend/crypto_core/hybrid_encryptor.py`
- `hermes_backend/network_core/otp_registry.py`
- `docs/API_SPEC.md`

