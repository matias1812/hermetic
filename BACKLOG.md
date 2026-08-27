# Backlog — HermesChat

Consolidado tras la auditoría completa del 2026-08-27 (backend, núcleo Rust/WASM, frontend).
Para el detalle de cada fix ya aplicado, ver `git log` — cada commit de esa sesión trae el
diagnóstico completo (qué estaba mal, por qué, cómo se verificó) en el mensaje.

## ✅ Ya resuelto (2026-08-27)

- Bypass de autenticación en `/api/login` (no verificaba nada — cualquiera se autenticaba
  como cualquier usuario) y en el handshake WebSocket (mismo problema, otra puerta).
- Revocación de sesión al logout (el hook existía en un comentario, nunca se conectó).
- Cliente web usaba X25519 disfrazado de "Kyber" — ahora ML-KEM-1024 real.
- `contact_accept`/`group_invite`/`group_rekey`: el secreto de sesión viajaba cifrado con
  una clave AES fija y pública — ahora sellado real (ML-KEM) contra la clave del receptor.
- Bóveda local (IndexedDB) y `MediaStorage` (fotos/audio): cifraban con clave hardcodeada
  o no cifraban nada (método `getKey()` inexistente) — ahora usan la vault_key real.
- `persistence_manager.js` / `hermes_store.js`: mismo problema que arriba, pero más grave
  de lo que pareció al principio — el store SÍ está conectado a un evento real de login,
  solo queda inerte porque depende de un endpoint que no existe (ver pendientes). Arreglado
  igual porque un solo endpoint nuevo lo activaría.
- Backup automático a la nube nunca funcionó (firma falsa `"dummy_signature"` + tabla
  `cloud_backups` que nunca se creaba en `db_connection.py`).
- Zeroización de RAM en `blind_relay.py` era teatral (copiaba a un buffer temporal en vez
  de borrar el original — `bytes` inmutable no se puede sobrescribir).
- Backdoor de username hardcodeado (`admin`/`m4mbito`) en el panel de administración.
- `screenshot_shield_pro.js`: corría en paralelo a `screenshot_detector.js`, sin beneficio
  real de seguridad, con riesgo real de borrar la sesión de un usuario legítimo por falso
  positivo (heurística de DevTools). Eliminado.
- `pqcrypto>=0.17.0` en `requirements.txt` (versión que nunca existió) y `purge_all()`
  crasheaba si `replay_claims` no existía.
- `Dockerfile.backend` + `render.yaml` — build y arranque probados de punta a punta en
  Docker real (no solo pytest): registro, login, WebSocket con firma real, todo verificado
  contra el contenedor corriendo. Encontrado y arreglado en el proceso: `api.py` crasheaba
  al importar si `dist/` (el frontend build) no estaba presente junto al backend.
- Log de acceso nativo de uvicorn imprimía la IP real sin pasar por `PrivacyMiddleware` —
  ahora `--no-access-log` obligatorio, documentado en el Dockerfile.

## 🔴 Alta prioridad

1. **Reconciliación post-pérdida-de-datos — falta el backend.**
   `reconciliation_manager.js` está enganchado a un evento real (`hermes:logged_in`, dispara
   en cada login) y tiene la UI completa (modal con 4 opciones: recovery key, archivo de
   backup, resincronizar, empezar de cero). Depende de `GET /api/user/state` y
   `DELETE /api/user/purge`, ninguno existe. Requiere decidir qué trackea el backend por
   usuario (membresía de contactos/grupos) para poder implementar la detección de
   discordancia. `persistence_manager.js` ya cifra correctamente lo que este flujo escriba.

2. **Recovery por mnemónico — sincronización con la nube rota.**
   `recovery_system_complete.js`'s `uploadBlob()`/`downloadBlob()` pegan contra
   `/api/recovery_blob` y `GET /api/backup/{id}`, ninguno existe. Arreglo de bajo esfuerzo:
   redirigir a `/api/backup` y `/api/backup/fetch` (ya funcionan, ya están probados) en vez
   de mantener un endpoint separado. Hoy la recuperación por mnemónico es local-only.

3. **Consolidar las 3 implementaciones de backup en la nube.**
   `backup_manager.js` (real, usa `/api/backup` correctamente) + `auto_backup_trigger.js`
   (duplica la lógica de subida en vez de reusar `backup_manager.js`) +
   `recovery_system_complete.js` (sistema aparte, ver punto 2). Decidir cuál es la fuente
   de verdad y hacer que las otras dos deleguen, en vez de mantener tres caminos paralelos.

4. **`hermes_ip_middleware` no se compila para Linux en el Docker del backend.**
   Cae al fallback seguro (`0.0.0.0`, no filtra la IP real) pero pierde el comportamiento
   diseñado (último octeto en cero, útil para rate-limiting por rango). Agregar un stage de
   build Rust→`.so` en `Dockerfile.backend`, o aceptar el fallback como suficiente y
   documentarlo explícitamente en vez de que sea un detalle implícito.

## 🟡 Media prioridad

5. **X3DH / `generate_prekey_bundle` incompleto.** Descarta la clave privada ML-KEM que
   genera, y el encapsulate contra la clave del receptor está simulado con bytes
   aleatorios en `create_session_from_bundle`. Código muerto hoy (nada de la UI lo llama —
   el camino real es `sync_manager.js` + `contact_accept`), pero con la infraestructura
   ML-KEM ya wireada (`seal_for_contact`/`open_from_contact`) completarlo es más rápido que
   antes, si se decide que vale la pena en vez de dejarlo como está.

6. **`HERMES_ENV=production` nunca se probó de punta a punta.** Requiere compilar
   `rust/hermes_ffi_py` (registro anti-replay compartido vía SQL) y provisionar
   MySQL/Postgres real. Sin eso, `native_core.py` aborta el arranque por diseño
   (fail-closed) — no es un bug, es una decisión pendiente sobre si vale la inversión para
   el volumen de tráfico actual, o si el modo actual (registro en memoria, un solo proceso)
   alcanza por ahora.

7. **Panel de administrador sin backend real.** `admin_panel.js` ahora es fail-closed
   (no otorga nada), pero no existe ninguna ruta admin-gated en `api.py`. Decidir: ¿se
   construye autorización real emitida por el servidor, o se retira la UI del panel por
   completo mientras no haga falta?

8. **`hermes_store.js` / `store/*.js` solo los ejercita un test manual.** Ningún archivo de
   UI real (`chat_ui.js`, `group_ui.js`, `auth_ui.js` salvo lectura) escribe a través de
   `keysModule`/`chatModule`/`contactsModule`/`groupsModule` — es una capa de estado
   paralela a `state.js` que nunca terminó de reemplazarlo. Decidir: completar la migración
   a este store, o quitarlo si `state.js` alcanza.

## 🟢 Baja prioridad / cosmético

- `EphemeralImageStore` (`ephemeral_media_store.py`) e `ImageEncryptor` (`image_encryptor.py`):
  diseño honesto sobre sus límites (el propio docstring dice que para grupos el servidor
  genera la clave, no es E2E completo), pero nunca se conectó a `api.py`. Decidir si se
  completa o se retira.
- `websocket_handler.py`, `message_queue.py`, `mutable_buffer.py`: confirmados código
  muerto, autodocumentados como tal. Candidatos a borrar en una pasada de limpieza.
- Mnemónico de recuperación: 12 palabras × 8 bits/palabra = 96 bits de entropía, no los
  128 bits de un BIP-39 estándar de 12 palabras. No es explotable (96 bits sigue siendo
  enorme), pero no está documentado en ningún lado — vale aclarar la elección o subirla.
- `hermes_ffi_core`/`hermes_replay_sql` (Rust): nunca compilados en este entorno, no
  auditados en profundidad más allá de lo que exige el punto 6.
- Workflows de CI (`.github/workflows/`): no auditados esta sesión.
