# Arquitectura - HermesChat

## Visión General
```text
┌─────────────────────────────────────────────┐
│           Navegador (Frontend)              │
│  ┌───────────────────────────────────────┐  │
│  │       UI (Vanilla JS / Vite)          │  │
│  └───────────────┬───────────────────────┘  │
│                  │                           │
│  ┌───────────────▼───────────────────────┐  │
│  │      HermesBridge (FFI)              │  │
│  └───────────────┬───────────────────────┘  │
│                  │                           │
│  ┌───────────────▼───────────────────────┐  │
│  │    HermesCore (Rust/WASM)            │  │
│  │  - IdentityManager                   │  │
│  │  - SessionManager                    │  │
│  │  - RatchetManager                    │  │
│  │  - GroupManager                      │  │
│  │  - BackupManager                     │  │
│  │  - VaultEngine                       │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
                    │
                    │ WebSocket
                    ▼
┌─────────────────────────────────────────────┐
│              Backend (Python/FastAPI)       │
│  - Blind Relay                             │
│  - Rate Limiting                           │
│  - Validation                              │
└─────────────────────────────────────────────┘
```

## Flujo de Mensajes
1. UI → HermesBridge.sealMessage()
2. Rust: Ratchet step + encrypt + sign
3. Rust → ciphertext
4. HermesBridge → WebSocket → Backend
5. Backend → relay → destinatario
6. Destinatario: HermesBridge.openMessage()
7. Rust: verify + ratchet step + decrypt
8. Rust → plaintext → UI

---

## Est�ndares Criptogr�ficos Implementados

| Est�ndar | Algoritmo | Estado | Notas |
|----------|-----------|--------|-------|
| FIPS 203 (ML-KEM) | Kyber | ? | KEM h�brido |
| RFC 7748 | X25519 | ? | ECDH cl�sico |
| RFC 8032 | Ed25519 | ? | Firmas |
| RFC 5869 | HKDF | ? | Derivaci�n |
| RFC 8439 | ChaCha20-Poly1305 | ? | AEAD |
| Double Ratchet | Signal Protocol | ? | Forward Secrecy |

