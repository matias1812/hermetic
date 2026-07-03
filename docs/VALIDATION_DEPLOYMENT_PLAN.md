# 🚀 Plan de Validación y Despliegue a Producción - HermesChat

Este documento consolida la estrategia operativa para llevar HermesChat a su versión 1.0 (Producción), integrando auditorías independientes, automatización implacable y métricas de "Go/No-Go".

---

## 1. Modelo de Seguridad y Riesgos (Threat Model)
Antes de auditar, se formalizan los límites criptográficos del sistema.
* **Documento a consultar:** `SECURITY_MODEL.md`
* Establece claramente qué protege (SNDL, MitM, Servidor Comprometido) y qué no (Malware, Acceso Físico).

## 2. Reproducible Builds (Construcción Determinista)
El compilado de WebAssembly (WASM) debe ser exactamente el mismo para cualquier auditor:
* `cargo build --locked` (obligatorio en CI).
* `Cargo.lock` estrictamente versionado.
* `rust-toolchain.toml` con versión fija de Rustc.
* Hash SHA256 del binario final documentado en cada Release.

## 3. Supply Chain Security (Cadena de Suministro)
Controles automatizados para bloquear el pipeline en caso de dependencias vulnerables o licencias incompatibles:
* Integración de `cargo-deny`, `cargo-audit` y `cargo-vet`.
* Integración de `npm audit` y revisión de licencias.

## 4. Secret Scanning
Escaneo previo a cada Merge hacia `main` o `develop`:
* Uso de `gitleaks` y `trufflehog` en GitHub Actions para detectar fugas de API Keys, Seeds, tokens o variables de entorno.

## 5. Observabilidad Segura
El servidor de relevo (Backend) se restringe bajo las siguientes reglas de logging:
* **PROHIBIDO registrar:** texto plano, ciphertext, llaves (públicas o privadas), nonces, hashes de contraseña, IDs de usuario.
* **PERMITIDO registrar:** Request ID, Session ID efímera, Códigos de error HTTP/WS, Métricas de tiempo de respuesta.

## 6. Integridad del Cliente
Las aplicaciones web en producción contarán con protecciones de inmutabilidad:
* Directivas **Subresource Integrity (SRI)** para todos los scripts y hojas de estilo distribuidas.
* Integridad del paquete WASM validada antes de su instanciación en el navegador.

## 7. Plan de Recuperación de Desastres (DRP)
Respuestas estandarizadas ante crisis operativas:
* **Documento a consultar:** `DISASTER_RECOVERY.md`
* Procedimientos para caída del servidor, rotación de certificados y pérdida de bases de datos.

## 8. Programa de Divulgación de Vulnerabilidades (VDP)
Relación formal con la comunidad de investigadores de ciberseguridad:
* **Documento a consultar:** `SECURITY.md`
* Políticas de Safe Harbor (Puerto Seguro), tiempos de respuesta esperados (SLA) y canales de reporte (GPG/ProtonMail).

## 9. Compatibilidad y Migraciones
Estrategia de versionado estricto para evitar corrupciones de estado E2E:
* Versionado del protocolo de red y formato de mensajes cifrados.
* Versionado del archivo de respaldo `.hermes`.
* Versionado del almacenamiento de IndexedDB.

## 10. Métricas de Salida (Go/No-Go para v1.0)
El botón de lanzamiento a Producción se bloquea hasta cumplir los siguientes umbrales:
* **0** vulnerabilidades críticas abiertas (código e infraestructura).
* **0** vulnerabilidades altas sin mitigación aprobada.
* **>90%** de cobertura en módulos criptográficos (Rust/WASM).
* **100%** de los tests End-to-End (E2E) aprobados.
* **0** memory leaks detectados en pruebas prolongadas de sesión.
* **Auditoría externa** completada y firmada por empresa de ciberseguridad reconocida.

---
*Este plan transforma a HermesChat de un prototipo seguro a un sistema de comunicaciones blindado y resiliente, apto para su operación en entornos críticos.*
