# 🛡️ Modelo de Seguridad y Amenazas - HermesChat

Este documento define con precisión criptográfica los vectores de ataque mitigados por **HermesChat**, las afirmaciones demostrables (claims), los límites operacionales y las suposiciones fundamentales de confianza.

---

## 1. Estado de Madurez de Seguridad (Executive Status)

| Área | Estado | Detalle / Referencia |
| :--- | :--- | :--- |
| **Arquitectura** | Estable | Aislamiento estricto de capa de UI (JS) y motor criptográfico nativo en Rust/WASM. |
| **Implementación Criptográfica** | Híbrida PQC | ML-KEM-768 activo en producción; ML-DSA integrado experimentalmente en evaluación. |
| **Auditoría interna pericial** | Completada | Pruebas unitarias, análisis de entropía/memoria y suites E2E superadas al 100%. |

---

## 2. Invariantes Criptográficas y Objetivos (Garantías)

* **Root Key Confinada:** La clave raíz nunca abandona el espacio de memoria Rust/WASM ni se exporta a JS.
* **Todo establecimiento de sesión:** usa derivación híbrida `HKDF(X25519 || ML-KEM-768)`.
* **Confidencialidad Perfecta Hacia Adelante (PFS) y Secreto Hacia Atrás (PCS):** El compromiso de claves a largo plazo no compromete claves pasadas, y el Double Ratchet cura la sesión futura.
* **Política Fail-Closed:** Todo fallo criptográfico aborta la operación de inmediato (ej. fallo de firma o de decapsulación).
* **ZeroizeOnDrop:** Toda clave temporal en Rust sobrescribe su memoria (`Zeroize`) al salir de su alcance.
* **Servidor Blind Relay:** El servidor nunca posee secretos ni claves de sesión; sólo enruta mensajes.

---

## 3. Modelo de Amenazas (Threat Model)

Asumimos que el atacante (Modelo Dolev-Yao extendido) puede:
* Interceptar, modificar o inyectar tráfico de red (MitM).
* Tener control total sobre el servidor backend (Blind Relay).
* Almacenar tráfico hoy para intentar descifrarlo en el futuro con computadoras cuánticas (Store-Now-Decrypt-Later).

### Supuestos de Confianza
1. **Relevo Ciego No Confiable:** El backend es considerado infraestructura hostil (Honest but Curious o Malicious).
2. **Navegador Seguro:** El cliente se ejecuta en un SO libre de malware, con HTTPS y WebCrypto seguros.
3. **Validación de Identidad:** El usuario verifica los Safety Numbers a través de un canal seguro (Out-of-Band).

---

## 4. Qué Protege y Qué NO Protege

| Escenario de Amenaza | Estado | Detalles de Defensa |
| :--- | :---: | :--- |
| **Servidor comprometido o ISP malicioso** | ✔ Protegido | Arquitectura Zero-Knowledge y cifrado E2E + TLS. El backend no puede leer mensajes. |
| **Dumps de memoria RAM (Servidor / Cliente)** | ✔ Protegido | Backend usa hashes. Cliente usa WASM + Zeroize. |
| **Computadora cuántica futura (SNDL)** | ✔ Protegido (Handshake) | Protegido en el acuerdo de claves (ML-KEM). |
| **Ataques de replay (repetición)** | ✔ Protegido | Mitigado por el Double Ratchet y timestamp + firmas. |
| **Dispositivo infectado (Malware/Keylogger)** | ✘ No protegido | Fuera del modelo de amenazas. Un OS comprometido invalida todo aislamiento local. |
| **Captura física del equipo desbloqueado** | ✘ No protegido | El atacante tiene acceso visual si la bóveda está abierta. |
| **Ingeniería Social (Llave falsa)** | ✘ No protegido | Requiere verificación de la Huella (Safety Number). |

---

## 5. Security Claims y Matriz de Evidencia

| Afirmación (Claim) | Evidencia (Referencia de Código) | Método de Prueba |
| :--- | :--- | :--- |
| **Root Key permanece en Rust/WASM y se aplica Zeroize** | `state.rs` | Pruebas `wasm-pack test --node` |
| **Derivación Híbrida HKDF(X25519 \|\| ML-KEM)** | `x3dh.rs` | Test `test_pqc_corruption_changes_root_key` |
| **Servidor Blind Relay Sin Claves** | `network_core/api.py` | Suite E2E `e2e_crypto_verify.py` |
| **Integridad SHA-256 WASM en Runtime** | `crypto_wasm_bridge.js` | Test CLI Node contra `wasm_hash.js` |

*Nota: HermesChat NO afirma protección contra vulnerabilidades 0-day del navegador, ataques de canal lateral físico (side-channels hardware), o ataques a la cadena de suministro previo a la distribución final.*

---

## 6. Programa de Divulgación de Vulnerabilidades (VDP)

Agradecemos a la comunidad de investigadores su colaboración:
* **Canal de Contacto:** `security@hermes.chat`
* **Tiempos de Respuesta (SLA):** Acuse en 48 hrs. Evaluación en 5 días. Resolución en 15-30 días según criticidad.
* **Política de Puerto Seguro (Safe Harbor):** Investigaciones de buena fe sin afectar datos reales ni exfiltrar información no tendrán acciones legales.
* **Período de Embargo:** 90 días de confidencialidad solicitada para parches.
