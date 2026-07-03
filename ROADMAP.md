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
