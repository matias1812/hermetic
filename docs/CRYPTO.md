# Algoritmos Criptográficos - HermesChat

## Estándares Implementados

| Estándar | Algoritmo | Estado | Notas |
|----------|-----------|--------|-------|
| FIPS 203 (ML-KEM) | Kyber | ✅ | KEM híbrido |
| RFC 7748 | X25519 | ✅ | ECDH clásico |
| RFC 8032 | Ed25519 | ✅ | Firmas |
| RFC 5869 | HKDF | ✅ | Derivación |
| RFC 8439 | ChaCha20-Poly1305 | ✅ | AEAD |
| Double Ratchet | Signal Protocol | ✅ | Forward Secrecy |

## Propiedades de Seguridad
- **Forward Secrecy**: Rotación de claves por mensaje
- **Post-Compromise Security**: Recuperación automática tras compromiso
- **Store-Now-Decrypt-Later**: Híbrido clásico + post-cuántico
- **Replay Protection**: Contadores de mensajes
- **Integridad**: AEAD autenticado

## Invariantes
- Root Key derivada de HKDF(X25519 || ML-KEM)
- Toda clave temporal implementa ZeroizeOnDrop
- Fallo criptográfico → Fail-Closed
