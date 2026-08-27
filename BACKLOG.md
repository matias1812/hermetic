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

~~2. **Consolidar las 3 implementaciones de backup en la nube.**~~
   **Resuelto (2026-08-27).** `BackupManager.uploadToCloud(encryptedBuffer, backupType,
   algorithm)` es ahora la única implementación de `POST /api/backup` en el frontend.
   `auto_backup_trigger.js::uploadToCloud()` pasó de duplicar la subida a delegar en ella
   (import muerto de `CryptoClient` removido de paso), y el propio `_doAutoBackup` de
   `backup_manager.js` (rama de recovery key) también la usa en vez de tener su propia
   copia del fetch. `recovery_system_complete.js` queda aparte a propósito — deriva su
   clave de un mnemónico, no de la contraseña/vault local, así que no es un duplicado real
   del mismo flujo, sino un sistema de recuperación conceptualmente distinto. Wire format
   sin cambios (mismo shape `BackupPayload`), verificado con `tests/test_backup_upload_flow.py`
   y `tests/test_recovery_cloud_sync.py`.

~~3. **`hermes_ip_middleware` no se compila para Linux en el Docker del backend.**~~
   **Resuelto (2026-08-27).** `Dockerfile.backend` ahora tiene un stage `rust:1.80-slim-bookworm`
   que compila el `.so` (crate mínimo, solo `libc`, ~9s de build) y lo copia a la imagen final.
   Verificado en un container real: sin el fix, log `CRITICAL PRIVACY FAILURE... 0.0.0.0`
   en cada request; con el fix, la IP real se zeroniza correctamente (último octeto en 0).

## 🟡 Media prioridad

~~4. **X3DH / `generate_prekey_bundle` incompleto.**~~
   **Resuelto (2026-08-27).** `generate_prekey_bundle` ahora guarda la semilla ML-KEM-768
   (rota junto con `spk_secret` en cada llamada, campo nuevo `pqc_prekey_seed` en
   `HermesCore`, zeroizado en `Drop`/`close_session`). `create_session_from_bundle` hace
   encapsulate real contra `bundle.pqc_public_key` (antes: bytes aleatorios + SHA-256, sin
   protección PQC real — cualquiera que viera el ciphertext en tránsito podía recalcular el
   mismo "secreto" sin ninguna clave privada). `accept_session_handshake` decapsula de
   verdad con la semilla guardada (antes: SHA-256 del propio ciphertext público). Nuevo test
   `hermes_crypto_wasm/tests/x3dh_pqc_test.rs`: prueba positiva (Alice y Bob derivan la
   misma root key) + prueba negativa (una clave de decapsulación distinta deriva una root
   key distinta — la evidencia de que el secreto depende de verdad de la clave privada, no
   solo del ciphertext público). 14/14 tests del crate pasan (`wasm-pack test --node`).
   Sigue siendo código no wireado a la UI (el camino real de la app es `sync_manager.js` +
   `contact_accept`/`seal_for_contact`) — pero ya no es código fantasma que aparenta
   protección PQC sin darla.

~~5. **`HERMES_ENV=production` nunca se probó de punta a punta.**~~
   **Resuelto (2026-08-27) — probado de punta a punta con evidencia real, no solo lectura
   de código.** La investigación cambió el diagnóstico dos veces:
   - Primero se creyó que faltaba escribir el motor cripto nativo
     (`generate_keys_native`/`encapsulate_and_encrypt_native`/`decrypt_and_decapsulate_native`).
     Falso: cero consumidores reales en la app (`HermesNativeCore.encrypt_envelope`/
     `decrypt_envelope` solo los llama `hermes_backend/verification/*.py`, un harness de
     auto-test interno — ningún endpoint real de mensajería los usa, el E2E real es
     100% client-side WASM). Y aunque `native_core.py` los busca, si `hermes_ffi` existe
     pero le faltan esos símbolos específicos, el arranque en producción NO aborta —
     solo loguea un warning. Verificado con evidencia: no hizo falta escribir ese motor.
   - Segundo, se creyó que el registro anti-replay compartido (`SqlReplayRegistry`) no
     estaba conectado del lado Python. También falso — `otp_registry.py` ya lo llamaba
     correctamente de punta a punta. Lo que faltaba de verdad era compilar
     `rust/hermes_ffi_py`, algo que nunca se había hecho con éxito en ningún entorno: 3
     bugs reales de compilación (nunca detectados porque nunca se compiló) — falta
     `use rand::RngExt` en `hermes_ffi_core`, falta la dependencia `rand` completa en
     `Cargo.toml` de `hermes_replay_sql`, y `Python::allow_threads` (pyo3 viejo) ya no
     existe en pyo3 0.29.0 (renombrado a `Python::detach`). Los tres arreglados.
   - Compilar nativo para Windows en esta máquina de desarrollo sigue sin ser viable
     (falta dlltool/MSVC), pero compilar para Linux en Docker sí lo es — y es el target
     real de despliegue (Render). Nuevo `Dockerfile.backend.native-test` (harness de
     prueba, no parte del pipeline de deploy) compila `hermes_ffi_py` para Linux y lo
     instala como `hermes_ffi.so`. Probado con un MySQL 8 real (`docker run`, no mock):
     `SqlReplayRegistry.health_check()`/`.claim()`/`.commit()` contra la tabla real
     `replay_claims`; arranque completo del servidor con `HERMES_ENV=production` +
     `HERMES_REPLAY_BACKEND=sql`; y un ataque de replay real vía HTTP (`/api/login` dos
     veces con la misma firma) correctamente rechazado (401) con la fila de consumo
     verificada directamente en MySQL (`SELECT ... FROM replay_claims` -> `state=consumed`)
     y el log estructurado `REPLAY_ATTACK_BLOCKED` de la app.
   - `db_connection.py` (la base de datos principal, aparte del registro de replay) sigue
     usando `DB_HOST`/`DB_USER`/etc. por separado y no se probó contra MySQL real en esta
     pasada — fuera del alcance de esta pregunta específica, cae a SQLite sin error si no
     hay MySQL alcanzable (comportamiento documentado, no un bug).

~~6. **Panel de administrador sin backend real.**~~
   **Resuelto (2026-08-27) — se retiró la UI.** Investigado antes de decidir: el gate
   (`checkAdminStatus()`) era fail-closed permanente (`isAdmin = false` sin ninguna vía para
   ponerlo en `true`), el botón y la ruta `#admin`/`#dashboard` por lo tanto eran
   inalcanzables, `/api/debug/db_status` (de donde `loadStats()` intentaba leer) no existe
   en el backend, y `this.stats`/`this.attackLogs` eran números fabricados en el
   constructor. `makeAdmin()` tampoco llamaba al servidor -- solo escribía `role: 'admin'`
   en storage local con una firma auto-computada que no protege nada. Es decir: no había
   NINGUNA infraestructura real que autorizar, panel 100% inalcanzable, y su HTML afirmaba
   "100% SECURE" y "Datos fehacientes en tiempo real" sobre datos inventados -- justo lo que
   AGENTS.md prohíbe (afirmaciones de seguridad absolutas). Construir autorización real de
   servidor solo para reactivar un dashboard de stats fabricadas no se justificaba. Eliminado
   `admin_panel.js` y todas sus referencias (`main.js`: import, ruta de hash, entrada en
   `setupClientRouting` -- la función entera quedaba vacía sin el admin panel, se borró
   completa; `auth_ui.js`: el bloque que mostraba/ocultaba el botón; `chat_ui.js`/`group_ui.js`:
   `admin-panel-modal` sacado de los arrays de cierre de modales; `index.html`: botón +
   modal). Build de frontend limpio, bundle ~17 KB más chico.

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
