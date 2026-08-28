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

> **Nota (2026-08-27):** esta lista estaba desactualizada respecto al código real — una
> pasada de testeo en vivo encontró que buena parte de "UX" ya está construida y funciona.
> Ver `BACKLOG.md` para el detalle de qué quedó realmente pendiente en grupos.

- [x] **Chat Privado — confirmaciones de entrega y lectura (Read Receipts)**: verificado en
  vivo tanto en 1:1 como en grupo — un mensaje pasa `pending` → `sent` → `delivered` →
  `read`. En grupo se agregó agregación `deliveredBy`/`readBy` por miembro (`BACKLOG.md` #10).
- [x] **Gestión Avanzada de Grupos**: agregar/salir/expulsar miembro funcionan, y la clave
  simétrica rota automáticamente en los tres casos (agregar, expulsar, salir) — antes era
  100% manual y desconectado, ahora es automático (`BACKLOG.md` #4 y #9).
- [ ] **Resiliencia Extrema Offline**: el reintento básico de outbox al reconectar y el
  polling REST de respaldo ya funcionan (`SyncManager.flushOutbox()`, verificado esta
  sesión); falta someterlo a los casos límite reales (cierre de navegador a mitad de envío,
  dos pestañas emitiendo a la vez — ver v1.1 abajo).
- [x] **Experiencia de Usuario (UX)**: salir de grupo, eliminar conversación, buscar dentro
  de una conversación (con navegación siguiente/anterior) e indicador de "escribiendo"
  (con soporte de grupo) — los cuatro verificados en código y/o en vivo, ya existen y
  funcionan.
- [ ] **Adjuntos Completos**: imagen y audio (incluso efímeros) ya funcionan; las imágenes
  efímeras de grupo además ganaron custodia temporal server-side para evitar reenviar la
  misma imagen N veces (ver `BACKLOG.md`, sección Baja prioridad). Sigue sin existir soporte
  de archivo/documento genérico (confirmado de nuevo en la pasada de 2026-08-27: solo
  `accept="image/*"` en el input real).
- [x] **Notificaciones**: Web Notifications API real ya integrada (`ui/hermes_notifications.js`
  + disparo desde `sync_manager.js` en mensajes nuevos con la pestaña oculta/inactiva).

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
- Auditoría Externa Acreditada
- Firmado de artefactos (Sigstore / Cosign)
- SLSA Level 3 compliance (Firma de procedencia)

*(X3DH completo, reconciliación post-pérdida-de-datos y `HERMES_ENV=production` con
`rust/hermes_ffi_py` compilado — los tres ítems que estaban acá — ya están resueltos y
probados de punta a punta. Ver `BACKLOG.md`, sección "✅ Ya resuelto".)*

Ver **[`BACKLOG.md`](BACKLOG.md)** para el detalle priorizado de todo lo anterior.

