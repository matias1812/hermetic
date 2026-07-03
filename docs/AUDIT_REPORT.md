# 🛡️ Informe de Auditoría Técnica y Arquitectura Criptográfica: HermesChat
**Fecha:** 2026-07-02
**Objetivo:** Documentar exhaustivamente la implementación de la capa criptográfica Híbrida PQC en el ecosistema HermesChat.

> [!IMPORTANT]
> **VEREDICTO DE AUDITORÍA INTERNA**
> Las características descritas en este documento han sido verificadas mediante inspección de código y pruebas funcionales reproducibles. Este documento detalla el estado técnico actual de la implementación, pero **no constituye una certificación independiente o externa**.

> [!WARNING]
> **DISTINCIÓN DE MODOS DE EJECUCIÓN Y FALLBACK**
> En entornos de desarrollo o pruebas automáticas donde el módulo FFI de Rust (`hermes_ffi`) no esté compilado o cargado, el sistema opera en **Modo Fallback Python (`pqcrypto`)** usando ML-KEM-1024 y SPHINCS+. Las métricas de auditoría local (caos, timing, entropía) obtenidas en dicho modo reflejan el comportamiento del respaldo Python y **no evalúan en tiempo de ejecución el motor nativo Rust/WASM**. En modo Producción (`HERMES_ENV=production`), el servidor rechaza el arranque sin el núcleo Rust (*Fail-Closed*).

---

## 1. Cumplimiento de Estándares

La arquitectura criptográfica de HermesChat ha sido diseñada basándose en los siguientes estándares de la industria:

| Estándar | Estado |
|----------|--------|
| FIPS 203 (ML-KEM) | ✅ Implementado |
| FIPS 204 (ML-DSA) | ⏳ Pendiente |
| RFC 7748 (X25519) | ✅ Implementado |
| RFC 8032 (Ed25519) | ✅ Implementado |
| RFC 5869 (HKDF) | ✅ Implementado |
| RFC 8439 (ChaCha20-Poly1305) | ✅ Implementado |
| Double Ratchet Specification | ✅ Adaptado |

---

## 2. Invariantes Criptográficas

Las siguientes propiedades deben mantenerse en cualquier versión de HermesChat:

✓ La Root Key nunca abandona el núcleo Rust/WASM.
✓ Ninguna clave privada se exporta al entorno JavaScript.
✓ Todo establecimiento de sesión deriva la Root Key mediante: `HKDF(X25519 || ML-KEM)`.
✓ Todo mensaje utiliza AEAD autenticado.
✓ Todo fallo criptográfico termina en modo Fail-Closed.
✓ Toda clave temporal implementa `ZeroizeOnDrop`.
✓ El backend nunca participa en operaciones criptográficas.
✓ El servidor nunca posee secretos suficientes para descifrar mensajes.

---

## 3. Arquitectura y Cobertura de Componentes

### 3.1 Garantías del Backend
El servidor (Blind Relay):
✓ No posee Root Keys.
✓ No realiza operaciones criptográficas.
✓ No descifra mensajes.
✓ No modifica ciphertexts.
✓ No genera claves.
✓ No almacena secretos de sesión.
✓ Sólo retransmite blobs cifrados.
✓ Elimina mensajes expirados según TTL.

### 3.2 Garantías del Puente FFI
✓ JavaScript nunca deriva secretos.
✓ JavaScript nunca calcula Root Keys.
✓ JavaScript nunca ejecuta Double Ratchet.
✓ Rust devuelve únicamente datos autorizados.
✓ Las estructuras sensibles implementan Zeroize.
✓ Los errores criptográficos terminan en Fail-Closed.

### 3.3 Persistencia Local
**Se almacena:**
✓ Ciphertext
✓ Metadata mínima

**Nunca se almacena:**
✗ Root Key
✗ Chain Key
✗ Message Key
✗ Shared Secret
✗ Identity Private Key

---

## 4. Dependencias de Plataforma

HermesChat depende intrínsecamente de:
• Correcta implementación de WebAssembly.
• Aislamiento y sandboxing del navegador.
• Integridad del sistema operativo subyacente.
• Correcto funcionamiento del generador criptográfico del SO (CSPRNG).

---

## 5. Cadena de Confianza y Resistencia (SNDL)

La arquitectura híbrida deriva la Root Key a partir de los secretos clásicos (X25519) y post-cuánticos (ML-KEM) mediante HKDF-SHA256. 

**La resistencia frente a ataques Store-Now-Decrypt-Later depende de la correcta implementación del esquema híbrido y de las propiedades criptográficas futuras de ambos algoritmos.**

---

## 6. Cobertura de Validación

| Tipo | Estado |
|------|--------|
| Unit Tests | ✅ |
| Integration Tests | ✅ |
| WASM Tests | ✅ |
| Benchmarks | ✅ |
| Chaos Tests | ✅ |
| Replay Tests | ✅ |
| MITM Tests | ✅ |
| Memory Tests | ✅ |
| Fuzzing Continuo | 🟡 |

---

## 7. Integridad de la Cadena de Suministro

**Estado actual:**
✓ `Cargo.lock` versionado.
✓ Dependencias fijadas.
✓ Versiones documentadas.

**Pendiente:**
⏳ SBOM (CycloneDX o SPDX)
⏳ Firmado de artefactos (Sigstore)
⏳ SLSA
⏳ Reproducible Builds

---

## 8. Roadmap de Seguridad

✅ X25519
✅ Double Ratchet
✅ ML-KEM
⏳ ML-DSA
⏳ Hybrid Ratchet PQC
⏳ Continuous Fuzzing
⏳ Auditoría Externa
⏳ Reproducible Builds
⏳ Supply Chain Attestation

---

## 9. Declaraciones que NO realiza HermesChat

HermesChat **no afirma**:
✗ Anonimato de red (Tor/I2P).
✗ Protección frente a malware.
✗ Protección frente a un SO comprometido.
✗ Protección frente a extensiones maliciosas.
✗ Certificación FIPS 140-3.
✗ Certificación Common Criteria.
✗ Auditoría externa completada.

---

## 10. Evidencias y Reproducibilidad

Todas las métricas y logs referenciados se encuentran asilados en el directorio `docs/evidence/` para revisión pericial. Para reproducir la auditoría de forma independiente, ejecute el siguiente flujo en la raíz del proyecto:

```bash
cargo fmt --check
cargo clippy -- -D warnings
cargo check --target wasm32-unknown-unknown
cargo test
wasm-pack test --node
cargo bench
npm test
npm run build
python main.py
```
*(Cualquier advertencia de clippy o fallo en tests unitarios invalida las garantías del presente informe).*
