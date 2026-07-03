# Declaraciones y Trazabilidad de Seguridad (Security Claims & Traceability Matrix)

Este documento concentra todas las afirmaciones verificables de seguridad del ecosistema **HermesChat**, demarca explícitamente las exclusiones del modelo y vincula pericialmente cada declaración con su evidencia empírica en el código fuente, pruebas automatizadas o documentos técnicos.

---

## 1. Lo que afirmamos (Demostrable y Verificado Empíricamente)

1. **Confinamiento de la Root Key en Rust/WASM:** La clave raíz (`root_key`) del protocolo permanece invariablemente dentro del espacio de memoria lineal gestionado por el módulo WebAssembly en Rust, sin ser jamás exportada, serializada ni accesible por la capa JavaScript/DOM.
2. **Derivación Híbrida Post-Cuántica:** El protocolo deriva y avanza la Root Key durante las fases de negociación combinando de manera híbrida secretos clásicos y post-cuánticos mediante la función de derivación: `HKDF(X25519 || ML-KEM-768)`.
3. **Relevo Ciego Sin Claves de Sesión:** El diseño operativo del servidor de relevo (*Blind Relay*) no requiere que el backend posea claves de sesión E2EE ni material suficiente para descifrar los mensajes en tránsito o en cola.
4. **Política Fail-Closed:** Ante cualquier discrepancia en la verificación FFI, fallo de decapsulación PQC, corrupción de firma o discrepancia en el checksum SHA-256 del artefacto WASM (`WASM_EXPECTED_HASH`), el sistema aborta de inmediato la operación sin degradarse a modos no cifrados ni exponer estados intermedios.
5. **Saneación Efímera del Estado (`ZeroizeOnDrop`):** Las estructuras criptográficas temporales e internas en Rust implementan el trait `Zeroize` para sobrescribir su memoria asignada en el heap tan pronto salen del alcance funcional.

---

## 2. Lo que no afirmamos (Exclusiones Explícitas de Alcance)

Para evitar interpretaciones equívocas o afirmaciones categóricas infundadas, HermesChat **NO afirma**:

* **Anonimato de Red de Bajo Nivel:** No afirmamos ocultar las direcciones IP o el rastro de enrutamiento a nivel TCP/IP del cliente frente a un adversario con control del ISP o de la infraestructura de red subyacente (para esto se requiere Tor o I2P).
* **Protección Frente a Malware en el Dispositivo:** No afirmamos proteger los mensajes si el sistema operativo host o el navegador del cliente están comprometidos por rootkits, troyanos o keyloggers con acceso al DOM o memoria del proceso antes del cifrado WASM.
* **Inmunidad a Side-Channels Físicos:** No afirmamos resistencia formal contra ataques de canal lateral físicos (mediciones electromagnéticas, análisis diferencial de consumo eléctrico o ataques avanzados por temporización de hardware en la CPU).
* **Certificaciones Gubernamentales / Comerciales:** No afirmamos poseer las certificaciones FIPS 140-3 o Common Criteria emitidas por laboratorios externos acreditados (actualmente en fase de preparación pre-auditoría).
* **Verificación Formal Matemática Exhaustiva:** No afirmamos contar con demostraciones de verificación formal asistida por computador (ej. ProVerif / Tamarin) que cubran el 100% de los estados concurrentes del protocolo en todas sus extensiones experimentales.
* **Garantía Absoluta de Zeroize frente al Entorno:** Reconocemos pericialmente que `Zeroize` reduce la permanencia del secreto en memoria gestionada por Rust, pero no constituye una garantía formal frente a copias residuales creadas por optimizaciones agresivas del compilador, registros de la CPU o instantáneas (*snapshots*) de memoria del sistema operativo.

---

## 3. Matriz de Trazabilidad y Evidencia

Cada afirmación verificable está enlazada directamente a la evidencia empírica en el repositorio:

| Afirmación Verificable | Componente / Archivo de Código | Evidencia / Prueba Automatizada |
| :--- | :--- | :--- |
| **Confinamiento Root Key** | [hermes_crypto_wasm/src/ratchet/state.rs](file:///c:/Users/matia/OneDrive/Desktop/hermeticos/hermes_crypto_wasm/src/ratchet/state.rs#L144-L163) | Pruebas unitarias de aislamiento en `wasm-pack test --node` (`test_wasm_identity_and_signatures`). |
| **Derivación Híbrida HKDF** | [hermes_crypto_wasm/src/ratchet/x3dh.rs](file:///c:/Users/matia/OneDrive/Desktop/hermeticos/hermes_crypto_wasm/src/ratchet/x3dh.rs) | Test híbrido de integridad PQC: `test_pqc_corruption_changes_root_key`. |
| **Servidor Blind Relay** | [hermes_backend/network_core/api.py](file:///c:/Users/matia/OneDrive/Desktop/hermeticos/hermes_backend/network_core/api.py) | Suite de verificación E2E: `hermes_backend/verification/e2e_crypto_verify.py` (cero fugas a servidor). |
| **Integridad SHA-256 WASM** | [frontend/src/js/crypto_wasm_bridge.js](file:///c:/Users/matia/OneDrive/Desktop/hermeticos/frontend/src/js/crypto_wasm_bridge.js#L41-L57) | Comprobación de digest sincronizado en [frontend/src/js/wasm_hash.js](file:///c:/Users/matia/OneDrive/Desktop/hermeticos/frontend/src/js/wasm_hash.js). |
| **Política Fail-Closed** | [hermes_backend/crypto_core/native_core.py](file:///c:/Users/matia/OneDrive/Desktop/hermeticos/hermes_backend/crypto_core/native_core.py#L13-L57) | Suite de Caos e Inyección de Corrupción: `soak_and_fuzz_verifier.py`. |
| **Saneación Zeroize** | [hermes_crypto_wasm/src/ratchet/state.rs](file:///c:/Users/matia/OneDrive/Desktop/hermeticos/hermes_crypto_wasm/src/ratchet/state.rs#L144-L163) | Auditoría empírica en RAM transitoria: `hermes_backend/verification/memory_safety.py`. |
