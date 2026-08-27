# 🗺️ Hoja de Ruta Pública de HermesChat (Public Roadmap)

> **Filosofía de Producto:**
> *"Congelamiento Criptográfico Activo. No añadiremos más capas de cifrado, firmas redundantes ni algoritmos nuevos. El motor criptográfico (Rust/WASM + Web Locks) es robusto y estable. Nuestro foco absoluto es construir un producto funcional completo, resiliente y maduro."*

---

## 🟢 HermesChat vFinal — Core Criptográfico PQC y Persistencia (Completado)
**Estado:** `ESTABLE / AUDITADO / PQC-HYBRID`

- [x] **Double Ratchet Unificado en Rust/WASM**: Cifrado E2E X25519 + ML-KEM-768, Forward Secrecy.
- [x] **Auditoría Técnica PQC Integrada**: Generación empírica de evidencia de derivación Híbrida HKDF (Chaos Tests).
- [x] **Atomic Locks & Persistencia ACID**: Web Locks API (`navigator.locks`) sobre IndexedDB.
- [x] **Blind Relay Server**: Backend apátrida en Python.
- [x] **ML-KEM-1024 real en el cliente web** *(2026-08-27)*: `generate_identity_keys()` generaba
  X25519 disfrazado de "Kyber" — el cliente web nunca tuvo PQC real en el intercambio de
  claves hasta esta fecha. Ver `BACKLOG.md`.
- [x] **Autenticación HTTP/WS end-to-end** *(2026-08-27)*: `/api/login` y el handshake
  WebSocket no verificaban ninguna prueba de posesión de clave privada — cualquiera que
  supiera un alias podía autenticarse como esa cuenta. Cerrado y probado (`tests/test_login_auth.py`,
  `tests/test_ws_auth.py`).

---

## 🎯 HermesChat v1.0 — El Producto Funcional (Objetivo Inmediato)
**Objetivo Principal:** *Construir los flujos funcionales del cliente, UX, manejo extremo de desconexiones y operaciones de ciclo de vida.*

- [ ] **Chat Privado y Grupal Robusto**: Envío confiable, confirmaciones de entrega y recepción (Read Receipts).
- [ ] **Gestión Avanzada de Grupos**: Incorporación y salida de miembros, rotación de claves en cambios de composición.
- [ ] **Resiliencia Extrema Offline**: Reintentos automáticos, cola de mensajes pendientes robusta, sincronización sin pérdida tras reconexión (Offline Recovery).
- [ ] **Experiencia de Usuario (UX)**: Salir de grupo, eliminar conversaciones, buscar mensajes, indicadores de escritura (Typing Indicators).
- [ ] **Adjuntos Completos**: Soporte unificado de imágenes, documentos y audios efímeros.
- [ ] **Notificaciones**: Integración con Web Notifications API e indicadores visuales de nueva actividad.

---

## 🟡 HermesChat v1.1 — Casos Límite y Optimización (Siguiente Fase)

- [ ] **Tolerancia a Fallos Extrema**: Recuperación sin pérdida de estado al cerrar el navegador durante un envío o con dos pestañas emitiendo simultáneamente.
- [ ] **Optimización**: Gestión de consumo de memoria en DOM y WebAssembly, limpieza progresiva.
- [ ] **Auditoría de Pentesting (Post-v1.0)**: Una vez los flujos funcionales estén 100% terminados, se someterá el producto completo a pruebas de penetración dinámicas.
- [ ] **Mes 5-6 (Despliegue Productivo)**: Empaquetado nativo (Tauri), reproducible builds y firmas Cosign.

---

## 🔧 Infraestructura y Seguridad (Core Técnico)

### Completado ✅
- X25519, Ed25519, Double Ratchet, ML-KEM-1024 (real, ver arriba)
- ZeroizeOnDrop, CSP, DOMSanitizer, Web Locks
- Auto Backup, Continuous Fuzzing (Nightly CI)
- Supply Chain CI/CD (GitHub Actions), SBOM (CycloneDX)
- Autenticación HTTP/WS (ver arriba)

### Integrado Experimentalmente 🧪
- ML-DSA (FIPS 204)
- Reproducible Builds (Infra Docker)

### Pendiente ⏳
- Hybrid Ratchet PQC Completo (X3DH: falta guardar la clave privada ML-KEM generada en
  `generate_prekey_bundle` y reemplazar el encapsulate simulado — ver `BACKLOG.md`)
- Backend con estado real por usuario (contactos/grupos) para completar la reconciliación
  post-pérdida-de-datos — UI ya lista, faltan `GET /api/user/state` y `DELETE /api/user/purge`
- Compilar `rust/hermes_ffi_py` + Postgres/MySQL compartido para `HERMES_ENV=production` real
- Auditoría Externa Acreditada
- Firmado de artefactos (Sigstore / Cosign)
- SLSA Level 3 compliance (Firma de procedencia)

Ver **[`BACKLOG.md`](BACKLOG.md)** para el detalle priorizado de todo lo anterior.

