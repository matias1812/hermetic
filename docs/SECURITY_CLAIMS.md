# Declaraciones y Trazabilidad Normativa de Seguridad (Normative Security Claims & Traceability Matrix)

Este es el documento normativo de seguridad de **HermesChat**. Concentra todas las declaraciones verificables del ecosistema, demarca explícitamente las exclusiones y suposiciones del modelo de amenazas, enumera los riesgos residuales e incorpora la matriz de trazabilidad directa con el código fuente y las pruebas empíricas.

---

## 1. Security Claims (Afirmaciones Demostrables)

1. **Confinamiento de la Root Key en Rust/WASM:** La clave raíz (`root_key`) del protocolo permanece invariablemente dentro del espacio de memoria lineal gestionado por el módulo WebAssembly en Rust, sin ser jamás exportada, serializada ni accesible por la capa JavaScript/DOM.
2. **Derivación Híbrida Post-Cuántica:** El protocolo deriva y avanza la Root Key durante las fases de negociación combinando de manera híbrida secretos clásicos y post-cuánticos mediante la función de derivación: `HKDF(X25519 || ML-KEM-768)`.
3. **Relevo Ciego Sin Claves de Sesión:** El diseño operativo del servidor de relevo (*Blind Relay*) no requiere que el backend posea claves de sesión E2EE ni material suficiente para descifrar los mensajes en tránsito o en cola.
4. **Política Fail-Closed:** Ante cualquier discrepancia en la verificación FFI, fallo de decapsulación PQC, corrupción de firma o discrepancia en el checksum SHA-256 del artefacto WASM (`WASM_EXPECTED_HASH`), el sistema aborta de inmediato la operación sin degradarse a modos no cifrados ni exponer estados intermedios.
5. **Saneación Efímera del Estado (`ZeroizeOnDrop`):** Las estructuras criptográficas temporales e internas en Rust implementan el trait `Zeroize` para sobrescribir su memoria asignada en el heap tan pronto salen del alcance funcional.

---

## 2. Explicit Non-Claims (Lo que NO afirmamos)

Para evitar interpretaciones equívocas o afirmaciones categóricas infundadas, HermesChat **NO afirma**:

* **Anonimato de Red de Bajo Nivel:** No afirmamos ocultar las direcciones IP o el rastro de enrutamiento a nivel TCP/IP del cliente frente a un adversario con control del ISP o de la infraestructura de red subyacente (para esto se requiere Tor o I2P).
* **Protección Frente a Malware en el Dispositivo:** No afirmamos proteger los mensajes si el sistema operativo host o el navegador del cliente están comprometidos por rootkits, troyanos o keyloggers con acceso al DOM o memoria del proceso antes del cifrado WASM.
* **Inmunidad a Side-Channels Físicos:** No afirmamos resistencia formal contra ataques de canal lateral físicos (mediciones electromagnéticas, análisis diferencial de consumo eléctrico o ataques avanzados por temporización de hardware en la CPU).
* **Certificaciones Gubernamentales / Comerciales:** No afirmamos poseer las certificaciones FIPS 140-3 o Common Criteria emitidas por laboratorios externos acreditados.
* **Verificación Formal Matemática Exhaustiva:** No afirmamos contar con demostraciones de verificación formal asistida por computador (ej. ProVerif / Tamarin) que cubran el 100% de los estados concurrentes del protocolo en todas sus extensiones experimentales.

---

## 3. Threat Model Assumptions (Suposiciones Fundamentales del Modelo)

* **Relevo No Confiable:** El servidor backend puede ser comprometido total o parcialmente, estar sujeto a escuchas legales o ser operado por un adversario pasivo/activo. Se asume que no proporciona acceso al contenido cifrado (confidencialidad E2EE intacta), aunque el adversario pueda generar denegación de servicio (DoS) o reordenar metadatos en tránsito.
* **Integridad del Entorno de Ejecución Local:** Se asume que el navegador del usuario opera conforme a la especificación de aislamiento estándar de W3C/ECMAScript y no presenta malware o extensiones maliciosas inyectando scripts en el hilo principal.

---

## 4. Evidence Matrix (Matriz de Evidencia Trazable)

Cada afirmación verificable está enlazada directamente a su evidencia empírica en el repositorio, la prueba que la respalda y sus limitaciones formales:

| Claim | Evidence (Code Reference) | Test / Verifier | Limitations / Status |
| :--- | :--- | :--- | :--- |
| **Root Key permanece en Rust/WASM** | [state.rs:L144-L163](file:///c:/Users/matia/OneDrive/Desktop/hermeticos/hermes_crypto_wasm/src/ratchet/state.rs#L144-L163) | `wasm-pack test --node` (`test_wasm_identity_and_signatures`) | Verificado empíricamente (Aislamiento FFI estricto sin getters de clave). |
| **Derivación Híbrida HKDF(X25519 \|\| ML-KEM)** | [x3dh.rs](file:///c:/Users/matia/OneDrive/Desktop/hermeticos/hermes_crypto_wasm/src/ratchet/x3dh.rs) | `wasm-pack test --node` (`test_pqc_corruption_changes_root_key`) | Verificado (FIPS 203 activo; ML-DSA en evaluación experimental). |
| **Servidor Blind Relay Sin Claves** | [network_core/api.py](file:///c:/Users/matia/OneDrive/Desktop/hermeticos/hermes_backend/network_core/api.py) | Suite E2E (`e2e_crypto_verify.py`) | Verificado (Cero fugas de claves de sesión en payloads transitados). |
| **Integridad SHA-256 WASM en Runtime** | [crypto_wasm_bridge.js:L41-L57](file:///c:/Users/matia/OneDrive/Desktop/hermeticos/frontend/src/js/crypto_wasm_bridge.js#L41-L57) | Suite Node CLI / Build check contra [wasm_hash.js](file:///c:/Users/matia/OneDrive/Desktop/hermeticos/frontend/src/js/wasm_hash.js) | Verificado (Política Fail-Closed ante modificación de un solo bit). |
| **Saneación Zeroize en Memoria** | [state.rs:L144-L163](file:///c:/Users/matia/OneDrive/Desktop/hermeticos/hermes_crypto_wasm/src/ratchet/state.rs#L144-L163) | Suite de memoria (`memory_safety.py`) | Verificado en RAM gestionada por Rust; limitado ante snapshots de SO/Navegador. |

---

## 5. Residual Risks (Riesgos Residuales Aceptados)

El proyecto identifica y documenta proactivamente los siguientes riesgos residuales inherentes a cualquier despliegue web criptográfico E2EE:

1. **Browser Compromise:** Vulnerabilidades 0-day en el motor de JavaScript o WebAssembly del navegador host que permitan romper el sandbox del proceso.
2. **Supply-Chain Compromise:** Ataques dirigidos a dependencias upstream o compresión maliciosa en repositorios de paquetes de terceros antes de la atestación SLSA Level 3.
3. **Endpoint Malware / Keyloggers:** Troyanos o software espía ejecutados con privilegios de kernel o usuario en el dispositivo final que capturen texto plano antes de su entrada al motor Wasm.
4. **Timing Side Channels:** Variaciones sutiles en los tiempos de respuesta o recolección de basura del motor JS/Wasm en navegadores específicos bajo monitoreo local de alta precisión.
5. **Hardware Attacks:** Ataques físicos de canal lateral por monitoreo de consumo energético o inserción de fallos (Fault Injection) sobre el chip del dispositivo final.
6. **Future Cryptanalysis:** Avances teóricos imprevistos en matemáticas reticulares que superen los márgenes de seguridad de ML-KEM-768 antes de la rotación a nuevas suites de claves.

---

## 6. Evidence Freshness (Frescura y Validez de la Evidencia)

> [!IMPORTANT]
> **Cláusula de Validez Pericial:**
> Este documento refleja el estado del código correspondiente al commit: `9644919`
> Las afirmaciones y matrices de trazabilidad aquí contenidas **dejan de estar respaldadas automáticamente** cuando el código fuente criptográfico o la infraestructura de compilación cambian, hasta que la evidencia empírica sea ejecutada y regenerada satisfactoriamente.
