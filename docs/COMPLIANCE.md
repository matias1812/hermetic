# Cumplimiento de Estándares - HermesChat

| Estándar | Estado | Evidencia |
|----------|--------|-----------|
| FIPS 203 (ML-KEM) | ✅ | `hermes_crypto_wasm/src/core_api.rs` |
| RFC 7748 (X25519) | ✅ | `hermes_crypto_wasm/src/ratchet/x3dh.rs` |
| RFC 8032 (Ed25519) | ✅ | `hermes_crypto_wasm/src/core_api.rs` |
| RFC 5869 (HKDF) | ✅ | `hermes_crypto_wasm/src/ratchet/x3dh.rs` |
| RFC 8439 (ChaCha20-Poly1305) | ✅ | `hermes_crypto_wasm/src/ratchet/dh_ratchet.rs` |
| CSP Level 2 | ✅ | `frontend/index.html` |
| OWASP Top 10 | ✅ | Validaciones implementadas en relay. |
