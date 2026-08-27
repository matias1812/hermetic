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
- Recovery por mnemónico y el backup remoto de `backup_manager.js` pegaban contra
  `/api/recovery_blob` y `GET /api/backup/{id}`, ninguno existía — redirigidos a
  `/api/backup`/`/api/backup/fetch` (reales), con firma y sesión reales. Wire format
  verificado contra el backend (`tests/test_recovery_cloud_sync.py`).

## 🔴 Alta prioridad

~~1. **Reconciliación post-pérdida-de-datos — falta el backend.**~~
   **Resuelto (2026-08-27).** Diseño elegido: registro explícito post-handshake (nunca
   inferido del tráfico del relay). Backend: tabla `user_relationships` +
   `POST`/`DELETE /api/user/relationships`, `GET /api/user/state`, `DELETE /api/user/purge`
   (`db_connection.py`/`api.py`, 8 tests en `tests/test_reconciliation.py`). Frontend:
   `SyncManager.registerRelationship()` disparado en los 4 puntos donde un handshake se
   completa de verdad — aceptar contacto (`chat_ui.js::acceptContactRequest`) y recibir
   `contact_accept` (`sync_manager.js`), crear grupo (`group_ui.js::createGroup`) y recibir
   `group_invite` (`sync_manager.js`). De paso se encontró y arregló un bug de rate-limit:
   `/api/register`, `/api/login` y `/api/verify` compartían un solo balde de cuota (la IP
   pelada como key en los tres) — cada uno tiene ahora su propia key.

2. **Consolidar las 3 implementaciones de backup en la nube.**
   `backup_manager.js`, `auto_backup_trigger.js` (duplica la lógica de subida en vez de
   reusar `backup_manager.js`) y `recovery_system_complete.js` (mnemónico, sistema aparte)
   ahora las tres pegan correctamente contra `/api/backup`/`/api/backup/fetch` — pero siguen
   siendo tres implementaciones paralelas. Decidir cuál es la fuente de verdad y hacer que
   las otras dos deleguen, en vez de mantener tres caminos independientes.

~~3. **`hermes_ip_middleware` no se compila para Linux en el Docker del backend.**~~
   **Resuelto (2026-08-27).** `Dockerfile.backend` ahora tiene un stage `rust:1.80-slim-bookworm`
   que compila el `.so` (crate mínimo, solo `libc`, ~9s de build) y lo copia a la imagen final.
   Verificado en un container real: sin el fix, log `CRITICAL PRIVACY FAILURE... 0.0.0.0`
   en cada request; con el fix, la IP real se zeroniza correctamente (último octeto en 0).

## 🟡 Media prioridad

4. **X3DH / `generate_prekey_bundle` incompleto.** Descarta la clave privada ML-KEM que
   genera, y el encapsulate contra la clave del receptor está simulado con bytes
   aleatorios en `create_session_from_bundle`. Código muerto hoy (nada de la UI lo llama —
   el camino real es `sync_manager.js` + `contact_accept`), pero con la infraestructura
   ML-KEM ya wireada (`seal_for_contact`/`open_from_contact`) completarlo es más rápido que
   antes, si se decide que vale la pena en vez de dejarlo como está.

5. **`HERMES_ENV=production` nunca se probó de punta a punta.** Requiere compilar
   `rust/hermes_ffi_py` (registro anti-replay compartido vía SQL) y provisionar
   MySQL/Postgres real. Sin eso, `native_core.py` aborta el arranque por diseño
   (fail-closed) — no es un bug, es una decisión pendiente sobre si vale la inversión para
   el volumen de tráfico actual, o si el modo actual (registro en memoria, un solo proceso)
   alcanza por ahora.

6. **Panel de administrador sin backend real.** `admin_panel.js` ahora es fail-closed
   (no otorga nada), pero no existe ninguna ruta admin-gated en `api.py`. Decidir: ¿se
   construye autorización real emitida por el servidor, o se retira la UI del panel por
   completo mientras no haga falta?

7. **`hermes_store.js` / `store/*.js` solo los ejercita un test manual.** Ningún archivo de
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
