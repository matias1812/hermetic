# 🔐 HermesChat vFinal — Sistema de Mensajería Híbrida PQC (Post-Cuántica) y Relevo Ciego

## ⚠️ DECLARACIÓN TÉCNICA VERIFICABLE (AUDITADA)

HermesChat es un sistema de cifrado extremo a extremo (E2E) con arquitectura de **Relevo Ciego (Blind Relay)** y un núcleo criptográfico unificado en **Rust compilado a WebAssembly (WASM)**.

Tras la última auditoría técnica y consolidación arquitectónica, HermesChat **ofrece Criptografía Híbrida Post-Cuántica (PQC)** verificable:
- **Híbrido Clásico/PQC**: Combina **X25519 (ECDH)** con **ML-KEM-768 (FIPS 203)** para la derivación de secretos maestros en el protocolo X3DH.
- **Firmas Digitales**: **Ed25519** para autenticación irrefutable de pre-claves públicas.
- **Double Ratchet (Trinquete Doble)**: Para Perfect Forward Secrecy (PFS) y post-compromise security iterado en Rust.
- **AES-256-GCM / XChaCha20**: Cifrado autenticado de mensajes y protección anti-replay.
- **Aislamiento en Memoria FFI**: Motor WASM Nativo (`hermes_crypto_wasm`) con `ZeroizeOnDrop` que destruye variables temporales, prohibiendo fugas al Garbage Collector de JavaScript.
- **Evidencia Empírica**: La arquitectura supera estrictas pruebas de caos (corrupción simulada) y genera logs de auditoría estilo NIST integrados en el pipeline de NodeJS/WASM.

---

## 🏛️ Arquitectura de Seguridad (Auditada y Congelada)

La arquitectura divide estrictamente los contextos de ejecución:

| Capa | Implementación Tecnológica | Política de Aseguramiento |
|---|---|---|
| **Motor Criptográfico E2E (Rust / WASM)** | Crate `hermes_crypto_wasm` compilado a WebAssembly. Encapsula toda la lógica de X3DH, ML-KEM y Double Ratchet. | **Inviolable:** Los secretos criptográficos (claves privadas, secretos compartidos) **nunca** se envían al entorno JavaScript. |
| **Puente Transaccional (FFI)** | `crypto_wasm_bridge.js` (HermesBridge). | **Fail-Closed:** Expone métodos transaccionales puros. Si la decapsulación PQC o firma falla, la sesión es abortada silenciosamente. |
| **Servidor de Relevo (Blind Relay)** | FastAPI + WebSockets apátridas (`api.py`). | El servidor enruta bytes hexadecimales opacos. No guarda historiales en disco ni posee llaves. |

---

## 🛡️ Propiedades Criptográficas Híbridas Reales

1. **Resistencia SNDL (Store-Now-Decrypt-Later)**: Al integrar ML-KEM-768 en la KDF (Key Derivation Function) inicial mediante HKDF-SHA256, los atacantes cuánticos futuros no podrán derivar la llave raíz del Double Ratchet aunque rompan la curva X25519.
2. **Forward Secrecy**: El protocolo Double Ratchet rota las claves simétricas en cada ciclo de mensaje.
3. **Resistencia a Manipulación (MITM)**: AEAD previene alteraciones en tránsito.

---

## 📚 Documentación Técnica Actualizada

- [docs/SECURITY.md](docs/SECURITY.md): Política de seguridad híbrida.
- [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md): Modelo de amenazas cuánticas y clásicas.
- [docs/CRYPTO.md](docs/CRYPTO.md): Detalles criptográficos reales (ML-KEM-768, X25519, Ed25519).
- [docs/evidence/](docs/evidence/): Logs empíricos de auditoría técnica PQC.

---

## 🛠️ Ejecución Local

```bash
# 1. Instalar dependencias
pip install -r requirements.txt

# 2. Iniciar servidor backend
python main.py

# 3. Iniciar entorno de desarrollo Frontend (Vite)
cd frontend
npm run dev
```
