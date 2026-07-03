# 🛡️ MODELO DE AMENAZAS Y LÍMITES DE SEGURIDAD (THREAT MODEL vFinal Híbrido)

> **Documento Normativo:** Este modelo define con precisión criptográfica los vectores de ataque mitigados por **HermesChat vFinal**, los límites operacionales del sistema y las suposiciones fundamentales de confianza, reflejando fielmente la arquitectura WASM PQC implementada.

---

## 1. 🌐 SUPOSICIONES FUNDAMENTALES DE CONFIANZA

1. **Relevo Ciego No Confiable (Untrusted Blind Relay):**
   * Se asume que el servidor backend (FastAPI/Python) puede ser comprometido total o parcialmente, estar sujeto a escuchas legales, o ser administrado por un adversario pasivo/activo.
   * Por diseño operativo, el servidor jamás almacena mensajes en disco ni posee llaves de descifrado. Solo enruta blobs de bytes cifrados (`blob`) y hashes de usuario (`recipient_id`).

2. **Aislamiento en Dispositivo del Cliente:**
   * Se asume que el sistema operativo y el navegador del usuario final están libres de malware de kernel (rootkits) o keyloggers activos durante la sesión.

---

## 2. 🛡️ VECTORES DE ATAQUE MITIGADOS (LO QUE HERMES PROTIGE)

| Vector de Ataque | Mecanismo de Defensa en HermesChat vFinal | Nivel de Protección |
| :--- | :--- | :---: |
| **Ataques Cuánticos (Store-Now-Decrypt-Later SNDL)** | Integración **Híbrida Post-Cuántica (PQC)** utilizando **ML-KEM-768 (FIPS 203)**. Un adversario futuro no podrá descifrar la captura actual debido a la inquebrantabilidad cuántica de la llave compartida en la fase de Handshake. | 🛡️ **ALTO** |
| **Intercepción en Tránsito (Man-in-the-Middle)** | Cifrado E2E autenticado (AES-GCM-256) con datos asociados (AAD) que enlazan emisor y receptor. El handshake X3DH requiere verificación de claves Ed25519. | 🛡️ **ESTRICTO** |
| **Pérdida de Secreto Hacia Adelante / Atrás** | **Double Ratchet (Trinquete Doble):** Cada mensaje enviado o recibido avanza la llave de sesión efímera. La exposición de una llave actual no compromete mensajes pasados ni futuros tras la siguiente respuesta. | 🛡️ **ESTRICTO** |
| **Compromiso del Servidor de Relevo** | Arquitectura **Blind Relay:** El servidor no tiene tablas de texto plano ni historial en base de datos; al reiniciarse o apagarse, la RAM transitoria se purga. | 🛡️ **ABSOLUTO** |
| **Dumps de Memoria RAM en Cliente** | Uso de **WebAssembly (Wasm en Rust)** para todas las operaciones criptográficas. Las claves privadas (X25519, Ed25519, ML-KEM) nunca tocan JavaScript y la memoria de Rust se limpia estrictamente usando el rasgo `ZeroizeOnDrop`. | 🛡️ **ALTO** |
| **Análisis de Tráfico por Tamaño** | Esteganografía en SVG: ofuscación visual del payload transmitido. | 🛡️ **MEDIO** |

---

## 3. ⚠️ LÍMITES DEL SISTEMA (LO QUE HERMES NO PROTIGE)

1. **Acceso Físico a un Dispositivo Desbloqueado:**
   * Si un atacante obtiene acceso físico al dispositivo del usuario mientras el navegador está abierto y la bóveda está desbloqueada, podrá leer las conversaciones.
   * *Mitigación incluida:* Botón de **Cierre de Sesión Rápido (Amnesia/Wipe)** y escudo anti-captura.

3. **Malware / Troyanos a Nivel de Sistema Operativo:**
   * Si el dispositivo del usuario está infectado con software espía (ej. Pegasus), el atacante puede capturar pulsaciones de teclado o leer la memoria antes de ser procesada por Wasm.

4. **Ingeniería Social / Suplantación de Identidad sin Verificación OOB:**
   * Si el usuario acepta un contacto nuevo y omite verificar la huella criptográfica, un adversario que controle el canal inicial podría realizar un ataque MITM en la fase de establecimiento.
