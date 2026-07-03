# 🛡️ MODELO DE SEGURIDAD Y AMENAZAS (SECURITY MODEL)

Este documento define con precisión criptográfica los vectores de ataque mitigados por **HermesChat**, los límites operacionales del sistema y las suposiciones fundamentales de confianza.

---

## 1. Activos Protegidos
* Contenido en texto plano de los mensajes.
* Identidad y metadatos de asociación directa (quién habla con quién).
* Llaves privadas (X25519, ML-KEM, Ed25519).
* Llaves maestras y backups locales.

## 2. Actores
* **Usuarios Legítimos:** Participantes de una conversación en un canal seguro.
* **Servidor (Blind Relay):** Infraestructura en la nube que rutea mensajes cifrados.
* **Adversarios:** Entidades (pasivas o activas) que intentan comprometer la confidencialidad, integridad o disponibilidad del sistema.

## 3. Capacidades del Atacante
Asumimos que el atacante posee las siguientes capacidades (Modelo Dolev-Yao extendido):
* Capacidad para interceptar, modificar, inyectar o descartar cualquier paquete de red (MitM).
* Acceso completo y privilegios de administrador en el servidor de relevo (Blind Relay).
* Capacidad de almacenar tráfico cifrado hoy para intentar descifrarlo en el futuro (Store-Now-Decrypt-Later SNDL) utilizando computadoras cuánticas (CRQC).

## 4. Objetivos del Sistema (Garantías de Seguridad)
* **Confidencialidad Perfecta Hacia Adelante (PFS):** El compromiso de claves a largo plazo no compromete las claves de sesión pasadas.
* **Secreto Hacia Atrás (Post-Compromise Security):** Si el estado de una sesión se ve comprometido, las claves futuras se curarán tras el siguiente ciclo de mensajes bidireccional (Double Ratchet).
* **Integridad y Autenticación:** Detectar modificaciones maliciosas en tránsito mediante AEAD y firmas digitales.
* **Resistencia Cuántica:** Proteger el acuerdo de claves inicial contra computadoras cuánticas futuras.

---

## 5. Qué Protege y Qué NO Protege HermesChat

| Escenario de Amenaza / Vector | Estado | Detalles y Defensa en HermesChat |
| :--- | :---: | :--- |
| **Servidor comprometido** | ✔ Protegido | Arquitectura Zero-Knowledge; el servidor no posee claves de sesión. |
| **ISP / Red WiFi maliciosa** | ✔ Protegido | Cifrado E2E + TLS 1.3. La intercepción revela tráfico ofuscado e indescifrable. |
| **Administrador del servidor** | ✔ Protegido | Privacidad por diseño; los administradores no pueden leer mensajes, sólo ver tamaños (ofuscados mediante esteganografía) y tiempos. |
| **Computadora cuántica futura** | ✔ Parcialmente protegido | Protegido en el *Handshake* (ML-KEM), previniendo SNDL. (Firma post-cuántica en desarrollo activo). |
| **Dumps de memoria RAM (Server)** | ✔ Protegido | El backend sólo almacena hashes irreversibles; no hay secretos en RAM del servidor. |
| **Dumps de memoria RAM (Cliente)** | ✔ Protegido | WASM + Zeroize limpia la RAM local post-cifrado. Las primitivas nunca tocan JS. |
| **Dispositivo infectado (Malware/Rootkit)** | ✘ No protegido | Fuera del modelo de amenazas. Un OS comprometido invalida el aislamiento de JS/WASM. |
| **Keylogger activo en el OS** | ✘ No protegido | El atacante podría capturar contraseñas maestras o mensajes antes del cifrado. |
| **Captura física del equipo desbloqueado** | ✘ No protegido | Si la pantalla está encendida y la bóveda desbloqueada, el atacante tiene acceso visual. (Mitigado parcialmente por modo View-Once y amnesia rápida). |
| **Ingeniería Social (Aceptar llave falsa)** | ✘ No protegido | Requiere verificación de la Huella (Safety Number) por un canal externo seguro (Out-of-Band). |

---

## 6. Supuestos de Confianza (Trust Assumptions)

1. **Relevo Ciego No Confiable (Untrusted Blind Relay):** El backend es considerado infraestructura hostil.
2. **Aislamiento en Dispositivo del Cliente:** El sistema operativo y navegador del usuario final están libres de malware y actúan correctamente (WebCrypto API confiable).
3. **Distribución Íntegra de Código:** El usuario recibe el Frontend (HTML/JS/WASM) intacto y verificado mediante Subresource Integrity (SRI) y TLS.
4. **Almacenamiento Local Seguro:** El navegador del usuario protege el `localStorage` e `IndexedDB` frente a otras pestañas (Same-Origin Policy).
