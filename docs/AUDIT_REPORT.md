# 🛡️ Informe de Auditoría Técnica y Arquitectura Criptográfica: HermesChat
**Fecha:** 2026-07-02
**Objetivo:** Documentar exhaustivamente la implementación de la capa criptográfica Híbrida PQC en el ecosistema HermesChat.

> [!IMPORTANT]
> **VEREDICTO DE AUDITORÍA INTERNA**
> Las características descritas en este documento han sido verificadas mediante inspección de código y pruebas funcionales reproducibles. Este documento detalla el estado técnico actual de la implementación, pero **no constituye una certificación independiente o externa**.

> [!WARNING]
> **DISTINCIÓN DE MODOS DE EJECUCIÓN Y POLÍTICA DE DESPLIEGUE**
> • **Modo Desarrollo (`HERMES_ENV=development`):** En entornos locales o de pruebas automáticas donde el módulo FFI de Rust (`hermes_ffi`) no esté compilado o cargado, el sistema puede utilizar el backend Python (`pqcrypto`) como respaldo (ML-KEM-1024 + SPHINCS+). Las métricas de auditoría local obtenidas en dicho modo reflejan el comportamiento del respaldo Python y **no evalúan en tiempo de ejecución el motor nativo Rust/WASM**.
> • **Modo Producción (`HERMES_ENV=production`):** Si el módulo nativo Rust/WASM no carga, la aplicación aborta inmediatamente el inicio y lanza un error fatal (*Fail-Closed*), en lugar de cambiar silenciosamente de implementación. Esto garantiza certidumbre sobre qué motor criptográfico está ejecutándose.

---

## 0. Evolución Arquitectónica hacia E2EE Estricto

En etapas previas de desarrollo, la generación de claves de identidad y la firma de desafíos se realizaban mediante llamadas al servidor, lo que era incompatible con el objetivo arquitectónico de mantener las claves privadas exclusivamente dentro del cliente WASM.

Actualmente, las rutas de autenticación e identidad auditadas ejecutan las operaciones criptográficas dentro del módulo WebAssembly, eliminando las dependencias identificadas del servidor y consolidando el modelo E2EE en el cliente web.

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

### 3.2 Garantías del Puente FFI y Memoria
✓ JavaScript nunca deriva secretos ni calcula Root Keys o cadenas de Double Ratchet.
✓ Rust devuelve únicamente datos autorizados a través de los límites FFI.
✓ **Verificación de Checksum en Runtime:** El frontend ([crypto_wasm_bridge.js](file:///c:/Users/matia/OneDrive/Desktop/hermeticos/frontend/src/js/crypto_wasm_bridge.js#L41-L57)) calcula en tiempo de ejecución el digest SHA-256 del binario cargado (`hermes_crypto_wasm_bg.wasm`), lo compara con el hash esperado de compilación (`WASM_EXPECTED_HASH`) y aborta la carga (*Fail-Closed*) si no coincide.
✓ **Saneación de Memoria (`Zeroize`):** Las estructuras sensibles en Rust implementan correctamente `Zeroize` y `ZeroizeOnDrop` para sobrescribir explícitamente los buffers sensibles antes de liberar la memoria gestionada. *Nota:* `Zeroize` no puede garantizar por sí solo la ausencia de copias internas en registros CPU, optimizaciones del compilador o instantáneas (*snapshots*) del navegador o sistema operativo.
✓ Los errores criptográficos terminan en Fail-Closed sin exposición de estado intermedio.

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

Las suites de pruebas automatizadas **verifican experimentalmente** en este entorno los invariantes y la resistencia del protocolo bajo las siguientes modalidades:

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

## 10. Limitaciones de la Revisión

Esta auditoría interna se basa en:
* Inspección manual del código fuente;
* Pruebas unitarias automatizadas;
* Pruebas de integración;
* Compilación y verificación experimental del artefacto WASM.

No incluye:
* Verificación formal matemática exhaustiva de estados de protocolo;
* Auditoría independiente por laboratorios externos acreditados;
* Análisis de canales laterales físicos (*side-channel analysis* sobre hardware);
* Revisión exhaustiva del motor del navegador o instantáneas de memoria subyacentes;
* Revisión de seguridad del sistema operativo host;
* Pruebas de penetración sobre infraestructura de red o servidores en producción.

---

## 11. Evidencias y Reproducibilidad

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
