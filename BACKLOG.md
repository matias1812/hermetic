# Backlog — HermesChat

Consolidado tras la auditoría completa del 2026-08-27 (backend, núcleo Rust/WASM, frontend).
Para el detalle de cada fix ya aplicado, ver `git log` — cada commit de esa sesión trae el
diagnóstico completo (qué estaba mal, por qué, cómo se verificó) en el mensaje.

## 🔎 Auditoría de verificación (2026-08-27, segunda pasada de diagnóstico)

Pedido explícito del usuario: no confiar en las afirmaciones de "Resuelto/Verificado" de
este archivo por default — releerlas todas contra el estado actual del código y marcar
cualquier discrepancia. Cobertura: las ~55 afirmaciones distintas de todas las secciones de
abajo (pre-sesión, multi-ventana/efímeros/recuperación, Alta prioridad ítems 1-4, Media
prioridad ítems 5-13), vía dos pasadas de lectura de código independientes más verificación
directa de los hallazgos.

**Resultado: ninguna afirmación de "Resuelto" resultó falsa ni regresionada.** Se encontraron
4 problemas reales que el backlog nunca había mencionado (ni como resueltos ni como
pendientes) — los cuatro arreglados y verificados en esta misma pasada:

- **`admin_pro.js` — un SEGUNDO panel de admin activo, con el mismo problema que el ítem 7
  (`admin_panel.js`) dijo haber eliminado.** `main.js` lo importaba sin ninguna guarda de
  autorización; se auto-instancia al cargar la página (`export const adminPro = new
  ProAdminPanel(); window.adminPro = adminPro; adminPro.startRealTimeMonitoring();`) y arranca
  un `setInterval` infinito que fabrica métricas falsas (`messages_24h += Math.floor(Math.random()
  * 3)`) para siempre mientras la pestaña esté abierta. `exportReport()` — invocable por
  cualquier usuario desde la consola vía `window.adminPro.exportReport()` — descarga un JSON
  con `total_users: 142`, `online_users: 38`, etc. (constantes hardcodeadas, nunca datos
  reales) y `status: 'SECURE_100'` — exactamente la combinación "datos inventados + afirmación
  de seguridad absoluta" que la razón original del ítem 7 identificó como inaceptable.
  Inofensivo en la práctica porque sus IDs de DOM (`stat-total-users`, `admin-alerts`, etc.) no
  existen en `index.html` (confirmado por grep), pero el objeto queda expuesto igual en
  `window`. **Fix**: borrado `frontend/src/js/admin_pro.js`, quitado su import de `main.js`
  (era la única referencia en todo el frontend). Build de frontend limpio después (71 módulos,
  antes 72).
- **Gate de disponibilidad nativa en `native_core.py` chequeaba nombres de símbolo que nunca
  coinciden con los que realmente se invocan — bug latente, no explotable hoy porque el gate
  de todos modos siempre da `False`** (`hermes_ffi_py` hoy solo exporta
  `NativeReplayRegistry`/`SqlReplayRegistry`, no motor de cripto nativo). El chequeo
  `required_symbols` pedía `encrypt_envelope_native`/`decrypt_envelope_native`, pero los
  call-sites reales (líneas 267 y 450) invocan `encapsulate_and_encrypt_native`/
  `decrypt_and_decapsulate_native`. Si algún día se implementa el motor nativo con los nombres
  que el gate pide, `NATIVE_AVAILABLE` daría `True` pero la primera llamada real explotaría con
  `AttributeError` porque esos símbolos específicos no existen bajo esos nombres. **Fix**:
  `required_symbols` corregido para coincidir exactamente con los call-sites reales, comentario
  agregado explicando por qué deben coincidir. Verificado: Docker build limpio + backend
  arranca y responde 200 en `/api/status/*`.
- **Comentario obsoleto en `hermes_crypto_wasm/src/core_api.rs`**: `generate_identity_keys()`
  seguía documentada como "(X25519 y Ed25519)" pese a que el propio ítem de esta sesión
  ("Ya resuelto (2026-08-27)", primera entrada) documenta que X25519 fue reemplazado por
  ML-KEM-1024 real — el código de la función ya usa `ml_kem::MlKem1024` correctamente, solo el
  comentario nunca se actualizó. **Fix**: comentario corregido, aclarando además por qué los
  campos siguen llamándose `kyber_*`/`sphincs_*` (convención histórica del resto del código,
  no los algoritmos reales usados). Cosmético puro, sin efecto en comportamiento — verificado
  con `cargo build --target wasm32-unknown-unknown --release` limpio.
- **Código muerto real en `auth_ui.js`**: `state.storage.getKey ? state.storage.getKey() : null`
  — `EncryptedStorageManager` nunca definió `getKey()` (confirmado: cero resultados en todo el
  frontend salvo ese propio call-site), así que esta rama siempre evaluaba a `null` y el
  `if (cryptoKey) state.mediaStorage.setKey(...)` nunca se ejecutaba. Inofensivo (`MediaStorage`
  ya no necesita inyección de clave, su propio `setKey()` es un no-op documentado a propósito),
  pero engañoso — sugiere un mecanismo de inyección de clave que no existe. **Fix**: las 2 líneas
  muertas eliminadas. Build de frontend limpio.

**Confirmado sin cambios** (afirmaciones existentes revisadas y sostenidas contra el código
actual, sin acción necesaria): los 4 ítems de "Alta prioridad", los 6 de "Media prioridad"
(5-10), los 3 de la sesión de diagnóstico (11-13), y las ~20 de las dos secciones "✅ Ya
resuelto" — incluyendo puntos de re-verificación específicos como la revocación de sesión
end-to-end (`is_jti_revoked` chequeado en el path compartido de todos los endpoints
protegidos, no solo un hook), el sellado ML-KEM real de `contact_accept`/`group_invite`/
`group_rekey` (nunca vía ratchet ni clave AES fija), la zeroización real de `blind_relay.py`
(bytearray sobrescrito byte a byte, no una copia a buffer temporal), y el mecanismo de
`fail-closed` de `_doUnlock` (rechaza contraseña incorrecta contra un vault existente en vez
de reescribir el marcador). Dos notas de diseño preexistentes, no contradicen ninguna
afirmación pero vale la pena que el equipo las tenga presentes: `storage_manager.js` usa una
contraseña hardcodeada (`'hermes_default_session_key'`) como intento de desbloqueo cuando se
llama `save()`/`load()` sin sesión activa — namespaced por `getUserId()` y sin efecto práctico
porque `_doUnlock` tira error si no hay `userId`, o falla cerrado si el `userId` es de una
cuenta real con otra contraseña; y `hermes_replay_sql` (backend SQL de anti-replay) sigue sin
tests propios más allá de la corrida manual contra MySQL real ya documentada en la sección de
Baja prioridad.

### Segunda vuelta (2026-08-28): demostrar en vivo lo que la auditoría anterior solo confirmó leyendo código

Pedido explícito del usuario tras la auditoría de arriba: lo que no se demostró corriendo algo
de verdad (servidor real, navegador real, red real) no cuenta como probado. Se re-verificaron
en vivo los puntos más críticos de seguridad, sin confiar en la lectura de código de la vuelta
anterior:

- **Bug real encontrado y arreglado en el proceso, no buscado a propósito**: al correr
  `wasm-pack test --node` (nunca corrido en esta pasada de auditoría, solo `cargo build`) para
  re-verificar el ítem 5 (X3DH), la suite completa **falló en tiempo de ejecución** con
  `SyntaxError: Unexpected token '*'` en el JS generado. Causa: el comentario que esta misma
  sesión escribió para arreglar la referencia obsoleta a "X25519" en
  `core_api.rs::generate_identity_keys` decía `kyber_*/sphincs_*` — esa combinación de
  caracteres contiene `*/`, que `wasm-bindgen` traduce a JSDoc en el `.js` generado y **cierra
  el bloque de comentario antes de tiempo**, dejando código suelto inválido. `cargo build` no
  lo detecta porque no corre el pipeline de generación de JS; hacía falta `wasm-pack test` (que
  sí ejecuta el JS generado) para verlo. Reescrito el comentario sin la secuencia `*/`.
  Reconstruido el artefacto real con `build_wasm.sh` (no solo `cargo build`, que nunca
  actualiza lo que consume el frontend) y confirmado con `npm run build` que el JS generado
  parsea limpio.
- **Ítem 5 (X3DH), 14/14 tests, corrido de verdad**: `wasm-pack test --node` → 14 tests en 7
  archivos, todos `ok` (backup:4, hybrid:2, practical_attacks:2, property_chaos:3, ratchet:1,
  signal_spec:1, x3dh:1). Corrección menor a la descripción original: `x3dh_pqc_test.rs` tiene
  **una** función de test que hace las dos aserciones (positiva y negativa) en secuencia, no
  dos funciones separadas — la propiedad de seguridad sí está probada, la cuenta de "2 tests"
  era imprecisa.
- **Bypass de autenticación en `/api/login`, contra un usuario real registrado por curl**:
  `POST /api/login` con `client_id` real pero `signature` inventada (`"ff"*64`) → `401 Invalid
  signature`. No alcanza con saber el alias/hash público.
- **Bypass de autenticación en el handshake WebSocket**: conexión cruda sin mandar ningún
  mensaje de auth → se mantiene abierta hasta `WS_AUTH_TIMEOUT_SECONDS` (15s, no 5 — el
  comentario del código lo aumentó en algún momento) y luego cierra sola con `code=1008
  reason="Authentication failed"`; mandando un `{type:"auth", signature:"ff"*64}` inventado →
  cierra con el mismo código en segundos, sin esperar el timeout.
- **Panel de admin, en la app real corriendo, no solo por grep**: `window.adminPro`,
  `window.ProAdminPanel`, `window.checkAdminStatus`, `window.makeAdmin` y
  `#admin-panel-modal`/`#stat-total-users` — los cinco `undefined`/`false` en la página cargada
  de verdad.
- **ML-KEM-1024 real, no X25519, por tamaño de clave**: `hermesBridge.generateIdentityKeys()`
  en el navegador real → clave pública de **1568 bytes** exactos (el tamaño real de una clave
  pública ML-KEM-1024; X25519 son 32 bytes — matemáticamente no pueden confundirse, esto no es
  inferencia).
- **Contraseña hardcodeada de `storage_manager.js`, las dos ramas reproducidas en vivo**: (a)
  sin ningún `userId` (carga anónima real antes de login) → `load()` tira
  `"No se ha definido un ID de usuario..."`, la contraseña hardcodeada nunca llega a probarse
  contra nada; (b) con el hash de una cuenta real presente pero sin desbloqueo real (se forzó
  el escenario a mano) → `load()` resuelve a `null`, `isUnlocked` queda `false` — falla cerrado
  de verdad, no corrompe ni desbloquea la bóveda real de Alice con la contraseña por defecto.
- **Revocación de sesión, ciclo completo con un login real (no un token viejo de sesión
  anterior)**: `POST /api/login` (firma real vía `CryptoClient.signTimestamp`) → token fresco →
  `GET /api/user/state` con ese token → `200`. `POST /api/logout` → `200, revoked:true`. El
  **mismo token**, reusado en el mismo endpoint → `401, "Session revoked"` (mensaje explícito,
  no un 401 genérico de token corrupto/expirado).
- **Pendiente, con costo/permiso explícito antes de intentarlo**: `rust_ffi.yml` nunca corrió
  en GitHub Actions real (todo lo validado fue equivalente en Docker local) — requeriría
  pushear una rama de prueba al remoto (`github.com/matias1812/hermetic.git`, existe), que no
  se hace sin permiso explícito. La zeroización real de RAM (`blind_relay.py`) no tiene forma
  práctica de demostrarse desde afuera del proceso (requeriría un inspector de memoria del
  proceso Python en vivo) — se deja como verificada solo por lectura de código, explícitamente
  marcada así, no como "probada".

### Tercera vuelta (2026-08-28): testeo con 3 usuarios reales + adversarial, vulnerabilidad crítica encontrada y corregida

Con las dos rondas anteriores ya al día, se pidió explícitamente seguir testeando: flujo
normal con 3 cuentas reales (registro, contactos, grupo, mensajería) y casos hipotéticos que
un usuario real podría intentar (ataques, entradas maliciosas, casos límite), todo en vivo
contra el servidor y el navegador reales, no por lectura de código.

- **Flujo normal, 3 cuentas reales**: registro → agregar contactos → crear grupo → mensajería
  de grupo → indicadores de escritura. Completo sin hallazgos.
- **XSS en mensaje de grupo**: `<img src=x onerror="window.__xss_fired=true">` enviado como
  contenido de mensaje se renderiza como texto escapado literal; `window.__xss_fired` nunca
  se puso en `true`. Sanitización funciona.
- **Rate limiting en `/api/relay`**: 110 requests idénticos rápidos → `{"200":1,"400":65,
  "429":44}`. Tanto el rate limit (`check_rest`, 100/60s) como el anti-replay
  (`claim_relay_nonce`, rechaza blobs con contenido byte-idéntico) son reales, no
  decorativos.

- **🔴 CRÍTICO encontrado — `POST /api/register` permitía toma de cuenta sin autenticación.**
  No hay contraseña del lado servidor: la autenticación real es por posesión de la clave
  privada (firma sobre un timestamp). `client_id = sha256(alias)`, y el alias está pensado
  para ser público (para que otros puedan contactarte) — es decir, `client_id` es
  trivialmente calculable por cualquiera que sepa (o adivine) el alias de otra persona.
  `db_connection.py::register_user()` (líneas 179-219 antes del fix), cuando el `id_hash` ya
  existía, hacía un `UPDATE` incondicional de `public_key_mlkem`/`public_key_sphincs` con lo
  que sea que mandara el request — sin pedir ninguna prueba de que quien llama es dueño de
  las llaves actuales. Reproducido en vivo por curl: registrar `fixtest_alias_1` con llaves
  `aa`/`bb`, luego volver a llamar `/api/register` con el MISMO `client_id` y llaves `ee`/`ff`
  → `200 success`, el servidor sobreescribía en silencio. Impacto real: (a) toma de cuenta
  permanente — la víctima real queda con una firma que ya no coincide con lo registrado,
  `401` en todo login futuro, sin aviso; (b) MITM contra cualquiera que inicie contacto nuevo
  después del ataque (cifrarían contra la llave pública del atacante, no la real). Se usó
  exactamente esta vulnerabilidad para corromper `userana1` (cuenta de prueba de la ronda
  anterior) durante la demostración — quedó con llaves `ee`/`ff` falsas hasta que el
  contenedor de test se reconstruyó con el fix.
  - Lo notable: **el resto del sistema ya esperaba este bug estuviera arreglado.**
    `api.py::register_keys` ya tenía un `except DatabaseError` que traduce
    `"already registered"` a `409` — nunca se disparaba porque `register_user()` nunca lanzaba
    esa excepción. `frontend/src/js/sync_manager.js::fetchPendingBlobs()` ya manejaba
    explícitamente un `409` de `/api/register` (detiene la sincronización, alerta al usuario)
    — código correcto, simplemente inalcanzable hasta ahora.
  - **Fix** (aprobado explícitamente por el usuario): `db_connection.py::register_user()`
    ahora rechaza con `DatabaseError("User already registered")` en cuanto `existing` es
    verdadero, antes de tocar la conexión — ya no hace ningún `UPDATE`. Se cubrió también la
    carrera TOCTOU (dos registros concurrentes del mismo `id_hash` nuevo pasando ambos el
    chequeo antes de que cualquiera inserte): el segundo `INSERT` choca contra la
    `PRIMARY KEY`, capturado explícitamente (`pymysql.err.IntegrityError` /
    `sqlite3.IntegrityError`) y mapeado al mismo `DatabaseError` de "ya registrado" en vez de
    caer al `503` genérico.
  - **Frontend, un call site sí necesitaba arreglo**: `sync_manager.js::getOrRecoverUserKeys()`
    (el fallback de "llaves locales perdidas, regenerar y re-registrar") llamaba a
    `/api/register` sin chequear `.ok` en absoluto — con el fix del backend, un `409` ahí
    habría dejado la bóveda local con llaves nuevas que el servidor rechazó, una
    desincronización auto-infligida. Corregido: ahora solo adopta/guarda las llaves nuevas si
    el registro fue aceptado; si no, no muta el estado local y, en el caso `409`, avisa al
    usuario a través de `modalManager` (mismo tratamiento que `fetchPendingBlobs()`).
    El otro call site (`auth_ui.js`, registro normal de cuenta nueva) ya manejaba
    correctamente cualquier `regRes` no-ok mostrando `err.detail` sin guardar nada
    localmente — no necesitó cambios.
  - **Verificado en vivo, backend reconstruido con el fix** (`docker build` +
    `docker run` del contenedor de test):
    - Registro de alias nuevo → `200`. Segundo registro del MISMO alias con otras llaves →
      `409 {"detail":"El usuario ya está registrado en la red HermesChat."}`. `GET
      /api/user/{id_hash}` confirma que las llaves originales (`aa`/`bb`) siguen intactas, no
      las del intento de sobreescritura (`ee`/`ff`).
    - Alias distinto sigue registrando con normalidad (`200`) — sin regresión.
    - Carrera: 8 requests concurrentes registrando el mismo `id_hash` nuevo → exactamente
      `1×200` + `7×409`, cero `503`, cero corrupción.
    - **En el navegador real, no por curl**: se registró `collisiontest1` a través del
      formulario real de "Generar identidad" (incluida la frase BIP-39 obligatoria y el
      onboarding) → cuenta funcional. Desde una segunda pestaña, se intentó registrar el
      MISMO alias `collisiontest1` con otra contraseña, simulando un atacante → apareció el
      modal `[ ERROR DE REGISTRO ] — El usuario ya está registrado en la red HermesChat.`,
      sin tocar el estado local. La pestaña de la cuenta legítima siguió logueada y funcional
      sin interrupción; `GET /api/user/{id_hash}` confirmó que el servidor sigue sirviendo la
      llave pública real (1568 bytes, ML-KEM-1024) y no la del intento de takeover.

- **Resto de casos hipotéticos/adversariales probados en esta ronda, todos sin hallazgos**
  (nombrados porque se pidieron explícitamente, no porque hubiera sospecha previa de bug):
  - **Inyección en el campo `client_id`** (`'; DROP TABLE users; --`, strings no-hex,
    longitud incorrecta) → `400 "Invalid client ID hash format."` por el regex de 64 hex
    chars antes de tocar la DB; tabla `users` confirmada intacta después (además, todas las
    queries ya son parametrizadas — el regex es defensa en profundidad, no la única capa).
  - **Sensibilidad a mayúsculas en el alias**: el formulario de registro
    (`auth_ui.js:1096`) normaliza con `.toLowerCase()` antes de derivar el `id_hash` — no hay
    forma de que la UI real cree dos identidades "iguales salvo mayúsculas" que colisionen ni
    que se confundan entre sí.
  - **Manipulación de token de sesión**: token inventado, ausente, vacío, con formato válido
    (4 partes separadas por `:`) pero firma HMAC falsa, y token expirado → los cinco casos
    `401` con mensaje específico (`Invalid session token format` / `Session token required` /
    `Invalid session signature` / `Session expired`). La verificación de firma usa
    `hmac.compare_digest` (comparación de tiempo constante) — no hay atajo de formato que
    salte la validación criptográfica.
  - **Bloqueo de contacto, real, en vivo**: `blocktest_bob` y `collisiontest1` se agregan
    como contactos, bob manda un mensaje (llega y se verifica su firma). `collisiontest1`
    bloquea a bob desde el menú del canal. Bob manda un segundo mensaje ("cifrado y enviado"
    de su lado, con recibo de un solo check en vez de doble check) — nunca aparece en el chat
    de `collisiontest1`, ni tras recargar el panel de conversación.
  - **Imagen efímera de grupo — límite de tamaño y autorización, contra el endpoint real**
    (`/api/media/group-ephemeral-image`, `MAX_EPHEMERAL_IMAGE_BYTES = 6MB`,
    `api.py:280,888`): payload de ~7.1MB decodificado → `413 "Image too large"`; imagen válida
    pequeña → `200` con `image_id`; sin el prefijo `data:image/` → `400 "Invalid image data
    URL"`; base64 corrupto → `400 "Malformed base64 image data"`. Contenedor de backend
    siguió respondiendo con normalidad después del payload de 7MB (sin crash, sin fuga de
    memoria visible). En `/api/media/group-ephemeral-image/fetch`: un usuario que NO está en
    `member_ids` de la imagen (`blocktest_bob`, probado con su propia sesión real) recibe
    `404 "Image not found or not authorized"` — nunca el ciphertext; el dueño real
    (`collisiontest1`) sí recibe `200` con `ciphertext_hex` presente.
  - **"Unirse a un grupo sin invitación" — no aplica a esta arquitectura, confirmado por
    código, no por intuición**: no existe ningún endpoint de servidor para grupos aparte de
    los tres de `group-ephemeral-image` (confirmado por grep de todas las rutas `@app.get`/
    `@app.post`), y `group_manager.js` no hace ningún llamado de red — la membresía de grupo
    es un concepto puramente local/cliente, cada mensaje de grupo es en realidad N envelopes
    1:1 cifrados y relayados individualmente a cada `id_hash` miembro. No hay `group_id`
    servidor que adivinar ni booleano de membresía que bypasear — la única superficie de
    ataque real es la cripto de cada envelope 1:1 individual, ya cubierta por el resto de
    esta auditoría.

### Cuarta vuelta (2026-08-28): `rust_ffi.yml` corrido en GitHub Actions real → 5 gates de CI que nunca habían corrido de verdad

Tras mergear el fix de `/api/register` a `main` vía PR real (no local), `rust_ffi.yml`
corrió por primera vez en el runner real de GitHub Actions — los 3 jobs pasaron limpio
(`test_ffi_core`, `build_ffi_py`, `test_replay_sql`). Pero el mismo push disparó TODOS los
demás workflows del repo, revelando 5 gates que **nunca habían corrido de verdad** hasta
ahora (todo lo validado antes de esto fue por lectura de código o por Docker local
equivalente, nunca el runner real con las versiones exactas de toolchain/lints que usa).
Los 4 de bajo riesgo se arreglaron y verificaron en el acto; el quinto (Semgrep,
`python.yml`) se deja pendiente a propósito porque toca juicio real de seguridad sobre el
núcleo cripto, no un fix mecánico.

- **`zap.yml` — el backend nunca llegó a levantar, en NINGÚN run histórico.** El step
  "Start FastAPI Backend" hace `nohup uvicorn ... &` y sondea `curl .../docs` por 30s, pero
  el `env:` del step solo seteaba `PYTHONPATH` — sin `SESSION_SECRET`/`ALLOWED_ORIGINS`,
  `api.py` aborta el arranque en el primer import (`RuntimeError: CRITICAL SEC-01/SEC-02`,
  el propio fail-closed del proyecto funcionando exactamente como está diseñado). El loop
  de sondeo no fallaba el step aunque los 30 intentos fallaran, así que quedaba en verde
  falso — recién ZAP, un step después, se topaba con "Connection refused" y ahí sí fallaba
  el job. Es decir: el DAST scan semanal contra el backend real **nunca escaneó nada** desde
  que estos checks fail-closed se agregaron. **Fix**: agregado `SESSION_SECRET`/
  `ALLOWED_ORIGINS` al step, y el loop ahora hace `exit 1` explícito (con el log del
  backend) si nunca contesta, en vez de seguir en silencio.
- **`security_ci.yml` ("Crypto Core Audit & Test") y `rust.yml` ("test_and_lint") — mismo
  `cargo fmt --check` real, mismo archivo, nunca pasaba.** `hermes_crypto_wasm/src/core_api.rs`
  tenía 27 bloques de drift de formato (nunca se corrió `cargo fmt` después de ediciones
  recientes al X3DH/ML-KEM). **Fix**: `cargo fmt` sobre todo el crate (incluye
  `dh_ratchet.rs`, mismo drift, un solo bloque). Verificado: `cargo fmt -- --check` → exit 0.
- **`rust.yml` ("asan_ubsan_fuzz") — el fuzz target de `decrypt_message` no compilaba.**
  `hermes_crypto_wasm/fuzz/fuzz_targets/decrypt_fuzzer.rs:27` llamaba
  `core.decrypt_message("dummy_session".to_string(), data.to_vec())`, pero la firma real
  (`core_api.rs:422`) es `decrypt_message(&self, contact_id: &str, ciphertext_json: &[u8])`
  — el harness quedó desactualizado tras un cambio de firma anterior y nunca se detectó
  porque este job jamás había corrido en CI real. **Fix**: una línea,
  `core.decrypt_message("dummy_session", data)`.
- **`security_ci.yml`/`rust.yml` (clippy `-D warnings`) — 12 errores reales, no cosméticos,
  en el núcleo cripto.** Arreglar el `cargo fmt` destapó que el MISMO gate también corre
  `cargo clippy -- -D warnings`, y ESE fallaba con 12 errores propios:
  - **10× `Array::from_slice` deprecado** (`Key::<Aes256Gcm>::from_slice`/`Nonce::from_slice`)
    en la construcción real de clave/nonce AES-256-GCM — 5 sitios en `core_api.rs`
    (`seal_for_contact`, `open_from_contact`, `decrypt_group_ephemeral_image`) y 3 en
    `lib.rs` (`encrypt_legacy_payload`, `decrypt_legacy_payload`, más un nonce). Migrado a
    `TryFrom` (`Key::<Aes256Gcm>::try_from(bytes.as_slice()).map_err(|_| ...)?`), siguiendo
    el mismo idioma "Fail-Closed: ..." que ya usa el resto del archivo. **Efecto colateral
    de seguridad, no buscado a propósito**: en `open_from_contact` (nonce viene de un JSON
    externo, `sealed_json`) y en `decrypt_legacy_payload` (nonce viene de un
    `encrypted_package` externo), el `from_slice` deprecado **paniqueaba** ante una longitud
    de nonce inválida — cualquiera podía tirar el proceso WASM mandando un nonce corto en
    un mensaje malformado. Con `TryFrom` ahora es un `Err` limpio (fail-closed real), no un
    panic (DoS). En `decrypt_group_ephemeral_image` la longitud ya se validaba antes
    explícitamente, así que ahí el `from_slice` nunca podía panicar en la práctica — el
    `TryFrom` ahí es solo higiene, sin cambio de comportamiento observable.
  - 2 lints sueltos sin relación con lo anterior: `WORDLIST` (2048 entradas BIP-39) pasado
    de `const` a `static` (recomendación de `clippy::large_const_arrays`, evita duplicar el
    array en cada sitio de uso), y un borrow de más en `Sha256::digest(&entropy)` →
    `Sha256::digest(entropy)`.
  - **Verificado real, no solo "compila"**: nuevo `hermes_crypto_wasm/tests/tryfrom_migration_test.rs`
    (`wasm-pack test --node`) ejercita las 5 funciones tocadas de punta a punta: roundtrip
    `seal_for_contact`/`open_from_contact` con llaves ML-KEM-1024 reales, rechazo correcto
    con la llave de decapsulación equivocada (`Err`, no panic), roundtrip
    `decrypt_group_ephemeral_image` contra un blob cifrado con `aes_gcm` directo más el
    caso de clave de 31 bytes, y roundtrip `encrypt_legacy_payload`/`decrypt_legacy_payload`
    más el caso de nonce de 3 bytes. **18/18 tests pasan** (14 preexistentes + 4 nuevos) —
    cero regresión en ningún camino de cifrado tocado. `cargo fmt -- --check` y
    `cargo clippy -- -D warnings` (comando exacto de los dos workflows) limpios. Artefacto
    real reconstruido (`build_wasm.sh` + `npm run build` del frontend) sin errores.
### Quinta vuelta (2026-08-28): `python.yml`/Semgrep — los 17 hallazgos de `sensitive-data-in-memory`, revisados caso por caso, los 17 eran falsos positivos

Se dejó explícitamente aparte de los 4 fixes mecánicos de la vuelta anterior por tocar
código de cripto real. Revisado archivo por archivo, línea por línea, contra la regla
real (`semgrep.yml`): `pattern: $VAR = $SECRET` con `metavariable-regex` sobre nombres que
contienen `private_key|secret|password|mlkem|sphincs`, excluyendo solo los casos con un
`del $VAR` literal después. Los 17 caían en tres categorías, ninguna era una zeroización
faltante de verdad:

1. **Ya zeroizado, pero vía `safe_zeroize()` (el helper real del proyecto,
   `hermes_backend/crypto_core/zeroize.py`), no `del`.** La regla solo reconocía `del
   $VAR` como prueba de limpieza — no reconocía la convención que el propio código ya usa
   en todos lados (`hybrid_encryptor.py`, `native_core.py`: `finally: safe_zeroize(...)`).
   `del` en Python tampoco serviría acá: para `bytes` (inmutable) no borra la memoria real,
   solo suelta la referencia; `safe_zeroize()` sí sobreescribe físicamente el buffer
   porque opera sobre `bytearray`/`memoryview` mutables — es una garantía más fuerte que
   lo que la regla pedía, no una más débil. **Fix**: `semgrep.yml` ahora tiene un segundo
   `pattern-not-inside` que también reconoce `safe_zeroize($VAR)` como limpieza válida.
   Bajó los 17 hallazgos a 12 sin tocar una sola línea de código de cripto.
2. **El valor se devuelve directo al llamador — no hay nada que zeroizar localmente sin
   invalidar el propio return.** `KyberManager.generate_keypair/encapsulate/decapsulate`,
   `SphincsManager.generate_keypair`, `HermesNativeCore.generate_keys`: son wrappers finos
   que generan la llave/secreto y lo devuelven tal cual — el ciclo de vida y la
   zeroización son responsabilidad de quien los llama (y esos call sites, verificado, sí
   zeroizan — ver punto 1). Un lector podría pensar "acá falta zeroizar", pero zeroizar
   ahí borraría el valor antes de que el `return` lo entregue.
3. **El `pattern-not-inside` de la regla no cruza el límite `try`/`finally` para
   reasignaciones dentro del propio `try`** (ej. `shared_secret = bytearray(shared_secret)`
   reasignando la misma variable ya inicializada en `None` antes del `try`) — confirmado
   leyendo el `finally` correspondiente unas líneas más abajo en cada caso, la
   zeroización real SÍ está.
4. **`db_connection.py:35` (`self.db_password`) es un caso distinto: atributo de
   instancia, no variable local transitoria.** Necesita vivir todo el ciclo de vida del
   objeto `DatabaseConnection` (se reusa en cada reconexión a MySQL vía
   `_get_connection()`) — zeroizarlo tras la primera lectura rompería la reconexión.

**Fix aplicado**: además del ajuste a la regla (punto 1), los 12 restantes (categorías 2-4)
llevan ahora `# nosemgrep: sensitive-data-in-memory` puntual con un comentario explicando
por qué, en la misma línea del hallazgo — el mismo mecanismo que `kyber_manager.py` ya
usaba en un lugar (línea 56) antes de esta pasada, aplicado de forma consistente al resto.
Ninguna lógica de cifrado, generación de llaves, ni limpieza de memoria fue tocada — el
único archivo con cambio de comportamiento es `semgrep.yml` (la regla en sí).

**Verificado real, no solo "debería estar bien"**: `semgrep ci --config=semgrep.yml` (el
comando exacto que corre `python.yml`) contra el repo completo en un contenedor Docker
limpio (`python:3.13-slim`, mismo patrón que las verificaciones anteriores) →
`Findings: 0 (0 blocking)`, `Scanning 43 files with 3 python rules`, `exit code 0`. Las
otras dos reglas de `semgrep.yml` (`python-sql-injection-fastapi`,
`fastapi-missing-privacy-middleware`) siguen intactas y en 0 hallazgos, confirmando que el
ajuste no aflojó nada fuera del alcance de `sensitive-data-in-memory`.

**Corrección sobre la marcha**: al mergear el fix de arriba a `main` y ver correr
`python.yml` de verdad, el job pasó de Semgrep (ahora limpio) al SIGUIENTE step que
tampoco se había alcanzado nunca — `Run Bandit SAST` (`bandit -r hermes_backend -ll -q`),
mismo patrón exacto de "cada fix destapa el siguiente gate nunca antes corrido" que ya
pasó con `rust_ffi.yml`/`zap.yml` en la vuelta anterior.

- **Bandit `B104` (`hardcoded_bind_all_interfaces`) en
  `privacy_middleware.py:110`, `return "0.0.0.0"` — falso positivo confirmado leyendo
  el código.** Esa línea es el fallback fail-safe de `_anonymize_ip_completely()` cuando
  la librería Rust real (`ip_lib`) no está disponible: devuelve el string `"0.0.0.0"`
  como IP anonimizada de PLACEHOLDER para el log (comportamiento ya documentado — ver
  ítem #3 de Alta prioridad, "modo degradado"), no un `host=` de bind de socket. B104
  está pensado para atrapar `app.run(host="0.0.0.0")`/`socket.bind(("0.0.0.0", port))`,
  y no distingue ese patrón de un literal de string usado para otra cosa. **Fix**:
  `# nosec B104` puntual con justificación en la misma línea (primer uso de `#nosec` en
  todo `hermes_backend/`, mismo mecanismo que `# nosemgrep`, mismo estándar de la
  herramienta). Verificado con el comando exacto de CI (`bandit -r hermes_backend -ll -q`)
  en Docker limpio → exit 0, sin salida (0 hallazgos medium+). De paso se corrió también
  el step siguiente (`pytest tests/test_hybrid_encryptor.py tests/phase7_audit.py
  --cov=hermes_backend --cov-report=xml`, con `PYTHONPATH=.` como en el workflow real) →
  **10/10 passed**, confirmando que no queda un séptimo gate agazapado detrás de este.

Con esto, los 5 workflows de CI que nunca habían corrido de verdad en GitHub Actions
(`rust_ffi.yml`, `zap.yml`, `security_ci.yml`, `rust.yml`, `python.yml`) quedan **verdes de
punta a punta**, cada step verificado individualmente contra el comando exacto que usa el
workflow real, no solo "el archivo se lee bien" ni Docker local aproximado.

### Sexta vuelta (2026-08-28): red cortada a mitad de un envío, backup a la nube eliminado, malware disfrazado de imagen, zeroización real y variables de entorno

Pedido explícito del usuario tras cerrar el CI: (1) terminar de probar en vivo el último
caso adversarial pendiente (red cortada a mitad de un envío), y (2) abrir una auditoría de
fuga de datos backend+frontend, zeroización real (no solo reclamada), variables de entorno,
y el flujo de backup ya logeado desde Settings — con dos ejes agregados sobre la marcha:
qué pasa si un usuario manda malware disfrazado de imagen, y si eso podría "infectar" un
backup restaurado en otro dispositivo.

**1. Red cortada a mitad de un envío — probado en vivo con Chrome DevTools (fetch
interceptado + eventos reales `online`/`offline`, no inferencia):**
- Mensaje normal: cortar la red justo al enviar → el mensaje queda `status:'pending'` en la
  UI y entra al outbox (`frontend/src/js/sync_manager.js:1136-1149`) — confirmado con
  `state.chatMessages`/`hermesStore.state.outbox` en vivo (`outboxLength:1`). Al reconectar
  (`window.dispatchEvent(new Event('online'))`), `flushOutbox()` lo reintenta solo y pasa a
  `status:'sent'`, outbox vacío. Funciona exactamente como está diseñado.
- **Gap real encontrado y arreglado (con evidencia antes/después en vivo)**: los mensajes
  efímeros (`ephemeral_text/image/audio`) quedaban excluidos del outbox a propósito
  (`sync_manager.js:1136`, chequeo `!payloadObj.type.startsWith("ephemeral_")`). Se probó en
  vivo con "vista única" activado + red cortada: el mensaje quedaba con `status:'pending'` en
  memoria (mismo ícono que el caso normal, **engañando** al usuario — parecía que se iba a
  reintentar) pero `outboxLength` se quedaba en `0`. Al reconectar, el mensaje se quedaba
  pegado en `'pending'` para siempre; al recargar la página, desaparecía completamente del
  historial sin ningún aviso (`EphemeralStore`, `frontend/src/js/ephemeral_store.js`, es solo
  en memoria, nunca se persiste). No era una fuga de datos (el mensaje nunca llegó a nadie),
  pero sí una pérdida silenciosa de UX con una señal visual engañosa.
  - **Fix** (pedido explícito del usuario, "arreglemoslo"): en `sync_manager.js::sendBlob()`,
    la condición que decide qué entra al outbox ya no excluye los tipos `ephemeral_*` —
    solo excluye `typing`/`receipt` (que nunca deben reintentarse). El outbox solo guarda
    `encrypted_blob_hex` (ciphertext) + hashes/timestamp, nunca texto plano, así que encolar
    un efímero ahí no reintroduce la fuga en disco que `EphemeralStore` fue diseñado para
    evitar. Se agregó `EphemeralStore.updateStatusById(msgId, newStatus)`
    (`ephemeral_store.js`) — espejo de `LocalChatManager.updateMessageStatusById` — y
    `flushOutbox()` ahora llama a ambos (uno de los dos siempre es no-op, según si el mensaje
    reintentado era efímero o no) para que el `status` en memoria pase a `'sent'` cuando el
    reintento realmente se entrega.
  - **Verificado en vivo (después del fix), mismo método que el "antes"**: con "vista única"
    activado, red cortada (`fetch` a `/api/relay` forzado a rechazar + `navigator.onLine` en
    `false` + evento `offline` real) y un mensaje efímero enviado, `hermesStore.state.outbox`
    pasó de `outboxLength:0` (antes) a `outboxLength:1` (después) — confirmado además que la
    única entrada agregada solo tiene `id/sender_hash/receiver_hash/encrypted_blob_hex/
    session_key_hash/timestamp`, cero texto plano. Al reconectar y llamar
    `flushOutbox()`, el outbox volvió a `0` y las dos burbujas "Texto Efímero" de la prueba
    pasaron a mostrar el mismo tick `✓` de "enviado" que ya usa un mensaje normal — confirmado
    con zoom sobre la UI real, no solo leyendo el estado en JS.
  - Nota de entorno: durante esta verificación el backend de desarrollo local había perdido
    el registro de los usuarios de prueba (`blocktest_bob`/`collisiontest1` devolvían
    `"...not registered"` en `/api/user/*` y `/api/relay`) — un problema de datos de prueba
    obsoletos por reinicios del backend a lo largo de una sesión muy larga, no relacionado con
    este fix. Se mockeó puntualmente esas dos respuestas del backend (mismo patrón que el
    "antes") para poder ejercitar el código real de `sendBlob`/`flushOutbox`/`EphemeralStore`
    sin ese ruido; la lógica de cifrado, el shape del outbox y el flip de estado que importan
    para este hallazgo corrieron sin mockear.

**2. Backup automático a la nube — eliminado por decisión explícita del usuario ("no existe
backup en la nube, solo local"):**
- Causa raíz: `frontend/src/js/auto_backup_trigger.js` tenía un destino `'cloud'` que, sin
  una recovery key real cacheada, cifraba con `user_hash + '_local_auto_key'` — una clave
  **derivable de información pública** (el `user_hash` es el hash del alias, pensado para
  ser conocido por cualquiera que quiera contactar al usuario). Cualquiera que pudiera leer
  una fila de `cloud_backups` (compromiso de DB, insider) y supiera el alias de la víctima
  podía descifrar trivialmente su "backup cifrado", rompiendo el diseño zero-knowledge por
  completo para ese camino específico.
  - **Corrección de severidad, encontrada al implementar el fix**: la UI que exponía la
    opción "Nube cifrada" (`frontend/src/js/privacy_settings.js::renderPrivacyPanel()`,
    radio `bkpDest`) **nunca se invoca en ningún lado del código** — `grep` confirma cero
    call sites de `renderPrivacyPanel()`. Es decir, ningún usuario real podía llegar a
    activar este destino a través de la interfaz visible; la lógica vulnerable estaba viva y
    conectada de punta a punta (`AutoBackupTrigger`→`BackupManager.uploadToCloud`→
    `POST /api/backup`), pero el interruptor de la UI para prenderla era código muerto. No
    cambia que haya que arreglarlo (`backupDestination` se puede setear igual desde la
    consola o si alguien reconecta ese panel sin re-auditar esto), pero sí cambia el riesgo
    real de explotación en el estado actual del producto: bajo, no nulo.
  - **Se dejó intacto a propósito**: el sistema de recuperación por 12 palabras
    (`frontend/src/js/recovery_system_complete.js`) comparte el mismo endpoint `/api/backup`
    como transporte, pero cifra con una clave derivada de verdad de la mnemónica
    (`hermesBridge.encryptWithRecoveryKey(mnemonic, ...)`) — nunca predecible, nunca
    derivable de info pública. Es la única forma de recuperar la cuenta si se pierde el
    dispositivo; el usuario confirmó explícitamente que debía quedar como está.
  - **Fix**: eliminado el destino `'cloud'` y el método `uploadToCloud()` de
    `auto_backup_trigger.js` y de `backup_manager.js` (import muerto de `CryptoClient`
    removido de paso); quitado el radio "Nube cifrada" de `privacy_settings.js` (queda
    `'local'`/`'custom'`, ambos 100% locales — `'custom'` solo cambia la carpeta de descarga
    vía `downloadBackupFile`, nunca toca la red). `auto_backup_trigger.js` ahora trata
    cualquier valor de `backupDestination` que no sea exactamente `'custom'` como `'local'`
    (defensivo: protege también a cuentas que ya tuvieran `'cloud'` cacheado en su
    `hermes_privacy_settings` local de sesiones anteriores).
  - **Verificado en vivo**: `npm run build` limpio tras los cambios; probado en el navegador
    real que el modal de "Backups y Recuperación Maestra" ya no ofrece ningún control de
    destino a la nube (el toggle "backup automático" visible solo expone intervalo, nunca
    destino); el botón manual `[ Nuevo Backup ]` sigue siendo 100% local, confirmado por
    lectura de código (nunca llamó a `uploadToCloud` ni antes ni ahora).

**3. Malware disfrazado de imagen — magic bytes reales, cliente y servidor, probado en
vivo con un SVG con `<script>` real:**
- Causa raíz: la única validación antes de aceptar una "imagen" era
  `file.type.startsWith('image/')` (`frontend/src/js/ui/chat_input.js:374`, cliente) y
  `image_data_b64.startswith("data:image/")` (`hermes_backend/network_core/api.py`,
  `/api/media/group-ephemeral-image`, servidor) — ambos validan solo el string que el
  navegador/cliente *declara*, no los bytes reales. `image/svg+xml` pasa los dos chequeos, y
  SVG es XML: puede llevar `<script>`/manejadores de evento embebidos.
  - **Mitigación ya existente, confirmada por lectura de código y en vivo**: toda imagen
    recibida se renderiza vía `<img>.src = dataURL`
    (`frontend/src/js/ui/message_renderer.js:241,435,576`) — los navegadores modernos NO
    ejecutan scripts embebidos en un SVG cargado así (a diferencia de `<object>`/`<iframe>`/
    navegación directa). No hay XSS ejecutable por esta vía específica hoy.
  - **Riesgo real que queda**: si el receptor guarda la "imagen" y la abre fuera del
    navegador (u otro código futuro cambia el render a `<object>`/`<iframe>`), un
    SVG-con-script sí se ejecutaría — mismo límite que cualquier app de mensajería, no
    100% "arreglable", pero sí vale subir la vara barato.
  - **Fix**: nuevo `frontend/src/js/utils/image_validation.js`
    (`isFileRealImage()`/`isKnownRasterImage()`) que lee los primeros bytes reales del
    archivo y los compara contra las firmas de PNG/JPEG/GIF/WebP, rechazando todo lo demás
    (SVG incluido) sin importar qué diga la extensión o el `Content-Type`. Aplicado en
    `chat_input.js` antes de aceptar el archivo del input de fotos. Mismo chequeo agregado
    en el backend (`api.py::_is_known_raster_image`) sobre `raw_bytes` ya decodificados en
    `/api/media/group-ephemeral-image`.
  - **Verificado en vivo, no solo "debería funcionar"**: subido un `.svg` real con
    `<script>window.__svg_script_executed=true</script>` vía el input de fotos real del chat
    (`file_upload` sobre el elemento real) → rechazado antes del modal de confirmación
    (`photoInput.value` se resetea, ningún mensaje nuevo se agrega,
    `window.__svg_script_executed` nunca se puso en `true`). El mismo SVG mandado directo al
    endpoint `/api/media/group-ephemeral-image` (con sesión real) → `400 "File is not a
    recognized raster image"`. Un PNG real de 1×1 al mismo endpoint → `200` (sin regresión).
    El mismo PNG real subido por el input de fotos real → pasa la validación y llega al
    modal `[ ENVIAR IMAGEN ]` (confirmando que el chequeo nuevo no bloquea imágenes
    legítimas; el envío en sí falló por un motivo no relacionado — el contacto de prueba no
    estaba re-registrado en el backend de test recién reconstruido, nada que ver con este fix).
- **Backup no agrega riesgo nuevo**: `backup_manager.js::readFile()` lee el `.hermes` como
  bytes crudos, descifra vía WASM y trata el resultado como JSON (`JSON.parse`, no ejecuta
  código) más los blobs de imagen ya cifrados tal cual estaban. Restaurar un backup no hace
  más que traer de vuelta lo que ya se había aceptado al recibirlo la primera vez — el fix
  de magic bytes de arriba ya previene que algo malicioso entre al store en primer lugar, así
  que también previene que salga después vía backup/restore. No hizo falta ningún cambio
  adicional acá, solo confirmar y documentar esta conclusión.

**4. Zeroización real — 5 gaps confirmados y arreglados (Rust/WASM + Python), el resto de
la memoria del proceso ya estaba sólida (`Drop` impls reales en `core_api.rs`,
`ratchet/state.rs`, `x3dh.rs`, `blind_relay.py`, `ephemeral_media_store.py`):**
- `hermes_backend/crypto_core/native_core.py:453`: `derive_aes_key(bytes(session_key))`
  pasaba un `bytes` inmutable — el `safe_zeroize()` interno de `derive_aes_key` hacía no-op
  silencioso (`isinstance(..., bytearray)` daba `False`). Fix: `bytearray(session_key)` en
  ese call site puntual, igual que ya se hacía en `hybrid_encryptor.py`/`native_core.py:478`.
- `hermes_crypto_wasm/src/core_api.rs::open_from_contact()`: la semilla cruda ML-KEM-1024
  (`seed_bytes`, 64 bytes) nunca se zeroizaba. Fix: `seed_bytes.zeroize()` apenas se deriva
  `seed` de ella.
- `hermes_crypto_wasm/src/lib.rs::encrypt_legacy_payload`/`decrypt_legacy_payload`:
  `aes_key_bytes` (SHA-256 de `session_key_hex`) nunca se zeroizaba, inconsistente con el
  resto del archivo. Fix: `.zeroize()` en las dos funciones apenas se construye `key`.
- `hermes_crypto_wasm/Cargo.toml`: `ed25519-dalek` no tenía el feature `"zeroize"`
  habilitado — `SigningKey` no zeroizaba su copia interna al hacer `Drop`, pese a que el
  comentario de cabecera de `lib.rs` afirma que "todas las claves/buffers sensibles usan
  zeroize". Fix: agregado el feature.
- `hermes_backend/network_core/api.py::/api/verify`: devolvía un dict **hardcodeado** con
  los 4 campos (`memory_safety`, `entropy_tests`, `timing_tests`, `perfect_secrecy`) en
  `passed: True` sin llamar a ninguna verificación real — endpoint público (solo
  rate-limited), mismo patrón de "dato fabricado + afirmación de seguridad absoluta" que ya
  se sacó de `admin_pro.js`. Fix: `memory_safety` ahora corre
  `MemorySafetyVerify.run_test()` de verdad en cada request (ya documentado como el
  `tested_by` real de ese requisito en `traceability/requirements.json`, solo que nunca
  estuvo conectado); los otros tres, al no tener un verificador real detrás hoy, se
  devuelven marcados explícitamente `passed: None` con `"No implementado"` en vez de
  inventar un resultado.
- **No tocados en esta pasada** (documentados, impacto marginal — todos requieren que un
  atacante ya tenga lectura de memoria del proceso, momento en el que ya comprometió todo):
  `create_session()`'s parámetros `Vec<u8>` sin zeroizar (la copia sí se zeroiza),
  `pqc_shared_secret` de ML-KEM sin zeroizar explícito, `HermesEngineWasm::init_conversation`/
  `WasmDoubleRatchet::new` sin zeroizar su copia local, `dh_ratchet.rs`
  `message_key`/`SkippedKey` sin zeroizar tras uso, `MemoryStorageBackend` sin zeroizar al
  borrar/sobreescribir, `hermes_backend/stego_engine/csprng_disperser.py` con
  `aes_key`/`nonce_base` sin zeroizar, `api.py` con un `aes_key` local de imagen efímera sin
  zeroizar tras pasarlo a `image_store`.
- **Verificado en vivo, no solo "compila"**: `cargo fmt`/`cargo clippy -D warnings` limpios;
  `wasm-pack test --node` → **18/18 tests pasan**, incluidos los 4 tests que ejercitan
  exactamente `open_from_contact`/`encrypt_legacy_payload`/`decrypt_legacy_payload` (los
  mismos que se escribieron en la vuelta anterior para la migración a `TryFrom`) — confirma
  que agregar los `.zeroize()` no rompió ningún roundtrip de cifrado real. Artefacto WASM
  real reconstruido (`build_wasm.sh` + `npm run build`) sin errores.

**5. Variables de entorno — 3 defaults inseguros silenciosos cerrados con fail-closed
explícito, más limpieza de un secreto de prueba en el repo:**
- `hermes_backend/network_core/db_connection.py`: `DB_PASSWORD` default `""` — si `DB_HOST`
  apunta a un host no-local pero se olvida `DB_PASSWORD`, la app intentaba conectar como
  `root` sin contraseña en silencio. Fix (`CRITICAL SEC-03`): falla cerrado si `DB_HOST` no
  es loopback y `DB_PASSWORD` está vacío. No afecta el caso legítimo de MySQL local sin
  password (dev en `127.0.0.1`/`localhost`).
- `hermes_backend/network_core/otp_registry.py`: `DATABASE_URL` default
  `"mysql://root:root@localhost/hermeschat"` — un DSN con credencial hardcodeada de verdad
  en el código fuente. Fix (`CRITICAL SEC-04`): sin default; si
  `HERMES_REPLAY_BACKEND=sql` y `DATABASE_URL` no está seteada, falla cerrado explícito.
- `hermes_backend/network_core/privacy_middleware.py`: `TESTING_MODE=1` (backdoor de
  spoofing de IP vía header `X-Test-IP` para tests locales) no tenía ningún chequeo cruzado
  con `HERMES_ENV`. Fix (`CRITICAL SEC-05`): falla cerrado si `TESTING_MODE=1` con
  `HERMES_ENV=production`.
- `scratch/audit_log_sample.py`: tenía un `SESSION_SECRET` de 32 caracteres hardcodeado en
  texto plano (no es un secreto real, pero es higiene de repo). Fix: generado al vuelo con
  `secrets.token_hex(16)` en vez de un literal fijo.
- **Verificado en vivo, los 3 fail-closed y el caso sano**: rebuild del backend Docker con
  todos los fixes → arranca limpio con la config de dev normal (`200`, "Application startup
  complete", ningún check nuevo se dispara sin motivo). Cada check probado disparando
  explícitamente la condición mala: `DB_HOST=algún-host-remoto` sin `DB_PASSWORD` →
  `RuntimeError: CRITICAL SEC-03` (confirmado en el log real del contenedor);
  `HERMES_REPLAY_BACKEND=sql` sin `DATABASE_URL` → `RuntimeError: CRITICAL SEC-04`
  (ídem). El de `TESTING_MODE=1`+`HERMES_ENV=production` quedó tapado en el contenedor de
  test por un gate *anterior* y no relacionado (`native_core.py` exige el binario Rust
  `hermes_ffi` compilado en producción, que esta imagen de test no compila) — se probó
  aislado, importando solo `privacy_middleware.py` sin pasar por el resto de `api.py`, y
  disparó correctamente: `RuntimeError: CRITICAL SEC-05`.
- **Verificado que nada de esto rompió lo demás**: `semgrep ci --config=semgrep.yml` (con
  `git` real instalado esta vez, no la corrida anterior que había fallado por
  `FileNotFoundError: git` aunque igual reportaba 0 hallazgos) → `Findings: 0 (0 blocking)`,
  `exit 0`. `bandit -r hermes_backend -ll -q` → limpio. `pytest
  tests/test_hybrid_encryptor.py tests/phase7_audit.py` → **10/10 passed**.

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

## ✅ Ya resuelto (multi-ventana / efímeros / frase de recuperación real)

- **Aislamiento multi-ventana.** Tres fugas reales confirmadas y cerradas: señal de logout
  cruzada entre cuentas (`logout_all_signal` sin namespacear → cerrar sesión en una pestaña
  desloguea TODAS las cuentas abiertas en otras pestañas del mismo navegador), token de
  sesión duplicado en `localStorage` (compartido entre pestañas, además de `sessionStorage`
  que sí es por-pestaña), y claves globales sin namespacing (`hermes_master_key_set`,
  `hermes_last_auto_backup`) que cruzaban cuentas. Namespaceadas todas por `user_id_hash`.
- **Bug de corrupción de cuenta, causa raíz de incidentes previos.** `EncryptedStorageManager
  ._doUnlock()` (`storage_manager.js`) fallaba ABIERTO ante una contraseña incorrecta contra
  un marcador de bóveda ya existente: silenciosamente reescribía el marcador con la
  contraseña nueva (equivocada) y devolvía éxito, envenenando la clave de la bóveda para el
  resto de la sesión. Ahora falla cerrado. Verificado con 3 recargas limpias + 1 intento de
  contraseña incorrecta (rechazado correctamente) + contraseña correcta después (sin
  corrupción residual).
- **Mensajes efímeros seguían dejando rastro en disco.** Todo mensaje/imagen/audio de "una
  sola vista" se escribía en `hermes_messages` (IndexedDB) *antes* de poder verse, y el
  borrado dependía de un timer del DOM que no sobrevivía un refresh. Nuevo `ephemeral_store.js`
  (registro en memoria, `Map`) mergeado en `chat_manager.js` — verificado en vivo que el
  contenido nunca aparece en IndexedDB, antes y después de interrumpir la cuenta regresiva
  con un refresh de página.
- **`hermes_store.js` (item 7 de abajo) resuelto**: reescrito como mirror liviano de solo
  outbox (reintento de envíos offline) sobre `state.storage` real, en vez de una capa de
  estado paralela a medio terminar. Verificado en vivo: outbox realmente se vacía al
  reconectar (`SyncManager.flushOutbox()`).
- **Frase de recuperación BIP-39 real y funcional de punta a punta.** Antes: wordlist de 256
  palabras (96 bits de entropía, no 128), `derive_recovery_key` ignoraba el `user_id_hash`
  (la misma frase derivaba la misma clave para cualquier cuenta del sistema), el modal se
  podía cerrar con Escape/click-afuera sin ninguna confirmación, y el flujo "restaurar desde
  la nube" en la pantalla de login pegaba contra `/api/backup/fetch` (requiere sesión) sin
  tener sesión — siempre 401, inalcanzable. Ahora: wordlist BIP-39 de 2048 palabras real (128
  bits), HKDF namespaceado por cuenta (`hermes_crypto_wasm/src/core_api.rs`), dos endpoints
  nuevos — `POST /api/recovery/register-proof` (con sesión, guarda un proof derivado por
  HKDF con un `info` distinto al de la clave de cifrado — el servidor nunca ve la mnemónica
  ni la clave real) y `POST /api/recovery/fetch` (sin sesión, autentica solo con el proof —
  esto es lo que hace posible recuperar una cuenta tras perder el dispositivo). Modal de
  registro ahora bloqueante de verdad (`modalManager.mandatoryRecoveryPhrase()`: Escape y
  click-afuera deshabilitados, exige re-escribir 2 palabras al azar antes de continuar).
  Verificado en vivo end-to-end: registro → modal bloqueante (rechaza palabras incorrectas,
  acepta las correctas) → proof guardado en el servidor (confirmado por consulta directa a
  la base) → simular "perdí el dispositivo" (borrar todo el storage local) → restaurar
  contactos/grupos/claves de identidad usando solo las 12 palabras vía el nuevo endpoint sin
  sesión → cuenta funcional de nuevo.
- **Bug encontrado durante el testeo de esta ronda**: `setupRecoveryUI()`,
  `setupBackupRestoreListeners()` y `setupSettingsDropdown()` se llamaban tanto en el boot
  global (`main.js::initApp()`, una vez por carga de página) como de nuevo en
  `auth_ui.js::doLoginTransition()` (una vez por login) — como internamente usan
  `addEventListener` sin proteger contra doble registro, cada click en "Generar Llave
  Maestra"/"Crear Backup"/etc. después del primer login de la sesión disparaba el handler
  DOS veces (dos mnemónicos generados y dos proofs registrados en carrera, doble subida de
  backup). Quitadas las llamadas duplicadas de `doLoginTransition` — esos tres ya quedan
  bien registrados una sola vez al boot.

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

~~4. **Un miembro expulsado/que sale de un grupo conserva la clave simétrica para siempre.**~~
   **Resuelto.** Verificado en vivo con evidencia real (no solo lectura de código) que el
   bug existía: se creó un grupo de 3 cuentas, se registró el hash de `symmetric_key`, una
   cuenta salió del grupo (`chat_ui.js` `btnLeaveGroup`), y la clave en las cuentas
   restantes quedó **byte-por-byte idéntica** a la de antes — nada disparaba `group_rekey`
   al salir alguien por su cuenta (a diferencia de la expulsión, ver #9, que sí rotaba pero
   estaba inalcanzable). Tampoco se rotaba al agregar un miembro nuevo (`btnConfirmAddMember`
   le mandaba al recién llegado la clave sin rotar). Arreglado en tres puntos: (1)
   `sync_manager.js`, rama `group_member_leave` — si quien recibe la notificación es el
   admin del grupo, genera y redistribuye una clave nueva a los miembros restantes; (2)
   `chat_ui.js` `btnConfirmAddMember` — rota la clave antes de invitar al nuevo miembro y
   se la manda ya rotada, y redistribuye la rotación a los miembros existentes; (3)
   `group_ui.js` gana `generateGroupKeyHex()` compartido. Verificado en vivo: hash de clave
   distinto antes/después de que alguien se fuera, y antes/después de agregar un miembro.

## 🟡 Media prioridad

~~5. **X3DH / `generate_prekey_bundle` incompleto.**~~
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

~~6. **`HERMES_ENV=production` nunca se probó de punta a punta.**~~
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

~~7. **Panel de administrador sin backend real.**~~
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

~~8. **`hermes_store.js` / `store/*.js` solo los ejercita un test manual.**~~
   **Resuelto** — ver sección "multi-ventana / efímeros / frase de recuperación real" arriba.

~~9. **Expulsar a un miembro de un grupo (no "salir uno mismo") no existe en la UI.**~~
   **Resuelto — diagnóstico original incorrecto, corregido acá.** El testeo en vivo no
   encontró forma de expulsar a nadie (el menú de tres puntos solo tiene `AGREGAR MIEMBRO`/
   `CONFIGURACIÓN GRUPO`/`SALIR DEL GRUPO`/`LIMPIAR CHAT`), así que se asumió que la función
   no existía y se implementó una nueva desde cero en `group_ui.js`. **Investigando más a
   fondo apareció la causa real**: `main.js` ya tenía desde antes una función completa
   `window.removeGroupMemberFn` (notifica, purga localmente, rota y redistribuye la clave —
   básicamente lo mismo que se acababa de reimplementar) enganchada a un botón "✕" real por
   cada miembro en una barra "👥 MIEMBROS: ..." — pero esa barra se renderizaba **dentro**
   de `#chat-messages`, y `renderMessages()` hace `container.innerHTML = ""` cada vez que se
   pinta un mensaje — o sea, `openGroupChat` pintaba la barra y al toque siguiente
   `renderMessagesCb()` la borraba, dejándola invisible siempre en la práctica. Código
   fantasma por partida doble: una función real e inalcanzable, y casi una reimplementación
   redundante encima. Arreglo real: la barra de miembros ahora vive en `#group-members-bar`,
   un contenedor nuevo en `index.html` fuera de `#chat-messages`, poblado por
   `group_ui.js::renderGroupMemberBadges()` — sobrevive a cualquier re-render de mensajes.
   Se borró la función duplicada de `group_ui.js` (la de `main.js` es la que corre y ya
   incluye la rotación de clave). Verificado en vivo end-to-end: clic en "✕" junto a un
   miembro → confirmación → miembro desaparece de la barra → `symmetric_key` del grupo
   cambia (hash distinto antes/después).

~~10. **Los recibos de entrega/lectura no existen para mensajes de grupo.**~~
   **Resuelto.** Funcionaban perfecto en 1:1 pero en grupo el `status` quedaba pegado en
   `"sent"` para siempre — no se enviaban receipts (`sync_manager.js`, rama `group_chat`) y
   el renderer solo dibujaba el tick para `state.activeContact`, nunca `state.activeGroup`
   (`message_renderer.js` línea 60). Un solo tick no puede representar "leído por N
   personas", así que se agregó `deliveredBy`/`readBy` (arrays, mismo patrón que `viewed_by`)
   al mensaje: cada miembro que recibe manda su receipt individual al remitente original
   (no a todo el grupo), y el remitente sube el `status` agregado a `delivered`/`read` recién
   cuando **todos** los demás miembros del grupo lo cubren. Verificado en vivo: al llegarle a
   Bob un mensaje de grupo con el chat abierto, `deliveredBy`/`readBy` en la copia de Alice
   pasan a incluir `"bobtest2"` y el aggregate queda correctamente en `"sent"` todavía
   (porque Carol, el tercer miembro, no está online en la prueba) — confirma que la lógica
   de "todos tienen que cubrirlo" funciona y no sube el status de forma prematura.

## 🟡 Media prioridad (encontrado en la pasada de 2026-08-27, sesión de diagnóstico)

~~11. **El WebSocket de tiempo real se cae 403 en desarrollo local y todo el mensajeo
    degrada a polling REST sin ningún aviso — root cause confirmado, no es una hipótesis.**~~
    **Resuelto** (usuario eligió ambas: ampliar el default de dev + hacer observable el
    fallback). Detectado al revisar `state.sync.websocket.readyState` en vivo (`3` = `CLOSED`) durante
    esta misma sesión de pruebas, con el log del backend repitiendo indefinidamente
    `WebSocket /ws/<hash> 403` / `connection rejected (403 Forbidden)` para TODAS las
    cuentas conectadas, cada ~2-5s. Confirmado con un WebSocket crudo desde la consola
    (`new WebSocket(...)`) tanto contra el proxy de Vite (`ws://localhost:5175/ws/...`) como
    directo contra el backend (`ws://localhost:8000/ws/...`) — ambos cierran con
    `code=1006` (fallo de handshake) en los dos casos, descartando que sea un problema del
    proxy de Vite. Causa raíz: `ALLOWED_ORIGINS` no está seteado ni en `.env` ni en el
    entorno del contenedor (confirmado con `docker exec ... env`), así que
    `api.py`'s`allowed_origins_env` cae al default hardcodeado
    (`http://localhost:8000,http://127.0.0.1:8000,http://localhost:3000,http://127.0.0.1:3000,
    http://localhost:5173,http://127.0.0.1:5173`) — que asume Vite en el puerto **5173**. Esta
    sesión (y cualquier desarrollador cuyo 5173 esté ocupado) corre Vite en **5175**, un
    origen que el check de `websocket_endpoint` (`api.py` línea ~1087) rechaza antes de
    aceptar la conexión.
    - **Por qué importa más que "solo un detalle de entorno de dev"**: el fallback a
      `blind_relay`/polling (`relay_blob_endpoint`) hace que la app **siga funcionando**
      (mensajes, invitaciones de grupo, imágenes efímeras — todo lo verificado hoy) sin
      ningún error visible para el usuario ni el desarrollador — es indistinguible de un WS
      sano salvo por latencia. Toda la mensajería en tiempo real que se dio por verificada
      hoy (incluida la feature nueva de imágenes efímeras de grupo) en realidad corrió sobre
      polling, no sobre el WS que el diseño asume como camino principal. Además el
      reintento de conexión es incondicional cada 5s (`sync_manager.js` línea 413, sin
      backoff) — con el WS roto, cada pestaña abierta genera tráfico de reconexión fallida
      indefinidamente contra el backend.
    - Nota de alcance: en producción (Render) `ALLOWED_ORIGINS` se configura explícito con
      el dominio real, así que esto no es una vulnerabilidad de producción — es un modo de
      falla silencioso en desarrollo local que además revela que no hay ningún chequeo/aviso
      (log, toast, contador) que distinga "todo bien, entregado por WS" de "degradado a
      polling", lo cual dificulta detectar esta clase de regresión de configuración incluso
      en producción si `ALLOWED_ORIGINS` quedara mal seteado ahí.
    - **Fix 1**: el default hardcodeado de `ALLOWED_ORIGINS` en `api.py` ahora también
      incluye `5174`/`5175`/`5176` (localhost y 127.0.0.1) además de `5173` — cubre el caso
      común de Vite eligiendo otro puerto porque el 5173 ya estaba ocupado. Solo afecta al
      *default* usado cuando la env var no está seteada (producción/Render sigue fijándola
      explícita, sin cambios ahí).
    - **Fix 2**: `relay_blob_endpoint` ahora emite `audit_event(event_type=
      "WS_DELIVERY_FALLBACK", ...)` cada vez que `ws_sent` da `false` y el mensaje cae a
      `blind_relay`/polling — antes esta degradación era 100% invisible en los logs.
    - Verificado en vivo con evidencia real, no solo build limpio: reconstruida la imagen
      Docker + reiniciado el contenedor con el nuevo default → `state.sync.websocket.
      readyState` pasó de `3` (`CLOSED`) a `1` (`OPEN`) sin cambiar nada del lado del
      cliente, y el log del backend mostró `"WebSocket ... [accepted]" / "connection open"`
      en vez del loop de 403. Para el logging: con Bob conectado (WS abierto) y Carol sin
      ninguna pestaña abierta, un mensaje de grupo produjo **cero** líneas
      `WS_DELIVERY_FALLBACK` para Bob (entregado por WS, silencioso como se espera) y **una
      línea por cada envío** con `client_id` = hash de Carol (la única sin WS activo) —
      confirma que el log distingue correctamente "entregado en tiempo real" de "degradado a
      polling" en vez de dispararse siempre o nunca.

~~12. **Harness automático (`?run_tests=true`) tiene aserciones muertas que referencian
    código ya eliminado a propósito, más un bug real de doble ejecución concurrente que
    causaba fallos falsos no determinísticos.**~~ **Resuelto.**
    - `verification_suite.js` llamaba `fullFlowSuite.testPersistence()` y
      `fullFlowSuite.testConcurrencyLocks()` — **ninguno de los dos métodos existía** en
      `tests/full_flow_test.js` (solo `testOutboxFlow`, `testContactsFlow`, `testGroupsFlow`,
      `testEphemeralImages`, `testChatMessaging`). Probaban la vieja capa paralela de estado
      (`hermes_store.js`/`persistence_manager.js`) reescrita como mirror de outbox en la
      sesión de multi-ventana — el reemplazo natural, `testOutboxFlow`, existía pero nunca
      se llamaba. **Fix**: reemplazadas ambas líneas por una sola llamada a
      `testOutboxFlow()`.
    - `verification_suite.js` afirmaba `window.proScreenshotShield` — ese módulo
      (`screenshot_shield_pro.js`) fue eliminado a propósito esta sesión. **Primer intento de
      arreglo fue incorrecto**: apuntar a `window.screenshotShield` (`screenshot_shield.js`,
      sin "Pro") — investigando por qué la aserción seguía en `false` tras el "fix" se
      encontró que **ese módulo también es código muerto**, nunca importado por `main.js`
      (`grep` confirma cero imports reales, solo el archivo existe suelto). El módulo que sí
      corre de verdad es `ScreenshotDetector` (`screenshot_detector.js`, importado por
      `auth_ui.js`, expuesto como `state.screenshotDetector` — el mismo que usa
      `message_renderer.js` al abrir una imagen efímera). **Fix real**: la aserción ahora
      chequea `state.screenshotDetector`.
    - **Bug real encontrado al re-verificar los fixes de arriba, no buscado a propósito**:
      `window.runHermesTests` (`main.js`) llamaba `finalEvaluation.evaluate()`,
      `verifier.runAllTests()` y `verifierSuite.runAll()` en secuencia **sin ningún
      `await`** — y `finalEvaluation.evaluate()` ya llama `verifierSuite.runAll()`
      internamente para armar su puntaje. Resultado: `VerificationSuite.runAll()` se
      ejecutaba **dos veces, concurrentemente**, pisándose sobre el mismo estado mutable
      (`state.groups.userGroups`, etc.) — confirmado reproduciendo el fallo:
      `testGroupsFlow()` llamado en aislamiento pasa limpio (`createdOk`/`updatedOk`/
      `leftOk` los tres `true`), pero fallaba de forma no determinística corriendo el
      harness completo, síntoma clásico de una carrera de datos, no de un bug del test en
      sí. **Fix**: `runHermesTests` ahora es `async` y hace `await` de
      `finalEvaluation.evaluate()` y `verifier.runAllTests()` en secuencia; se sacó la
      llamada redundante a `verifierSuite.runAll()`.
    - Verificado en vivo: 3 corridas consecutivas de `window.runHermesTests()` con sesión
      real, cero fallos en las tres (antes: fallos intermitentes en `testGroupsFlow` +
      fallo determinístico del screenshot shield). Resto de la suite sigue limpio: 9/9 en
      mensajería (texto/imagen/audio × 1:1/grupo/efímero), Double Ratchet Wasm 4/4,
      contactos, grupos, cripto (timing constante, zeroización), ratchet (PFS, no reuso de
      clave), privacidad (IPs anonimizadas, servidor no descifra). Build de frontend limpio.

13. **Casos límite de imágenes efímeras de grupo (feature de la sesión anterior) — sin
    bugs encontrados, control de acceso confirmado con cuentas reales distintas.**
    Verificado en vivo contra el backend corriendo: `image_data_b64` sin prefijo
    `data:image/` → 400; payload que decodifica a más de 6MB → 413; un miembro real y
    autenticado que NO está en `member_ids` de esa imagen puntual (`eimgcarol1`, sesión
    propia válida) → 404 al hacer `fetch` sobre un `image_id` real y existente; el mismo
    `image_id`, pedido por un miembro que SÍ está autorizado (`eimgbob1`) → 200 con
    `ciphertext_hex`/`nonce_hex`/`key_hex`; `mark_viewed` tras esa única vista → `deleted:
    true` (single-viewer, se limpia apenas lo ve el único destinatario). Sin hallazgos que
    reportar acá — la implementación de la sesión anterior resiste estos casos límite.

## 🟢 Baja prioridad / cosmético

- ~~`EphemeralImageStore` (`ephemeral_media_store.py`) e `ImageEncryptor` (`image_encryptor.py`):
  nunca se conectó a `api.py`.~~ **Resuelto — completado a propósito, no borrado** (decisión
  explícita del usuario: "Completarlo de verdad", contra mi propia recomendación de
  borrarlo). Esto introduce, **solo para imágenes efímeras de grupo**, una excepción
  consciente y acotada al modelo zero-knowledge general de la app: el servidor tiene
  custodia temporal de la clave AES-256-GCM (hasta que todos los destinatarios la vean o
  expire el TTL de 1h) en vez de que la imagen viaje embebida en el payload E2E como hoy
  hacen el resto de los tipos de mensaje (1:1, grupo no-efímero, texto/audio efímero —
  ninguno de esos caminos se tocó).
  - Backend: 3 endpoints nuevos en `api.py` (`POST /api/media/group-ephemeral-image` sube
    y cifra con `ImageEncryptor`/guarda en `image_store = EphemeralImageStore()`; `/fetch`
    devuelve `ciphertext_hex`/`nonce_hex`/`key_hex` gateado por `get_image()`; `/viewed`
    dispara `mark_viewed()`), agregado a la whitelist de 10MB de `PayloadSizeLimitMiddleware`.
    Límite documentado: no hay registro de membresía de grupo en el backend, los 3
    endpoints confían en `member_ids`/`group_id` provistos por el cliente al subir — mismo
    nivel de confianza que ya tiene hoy `sendGroupBlob` sobre a quién reenviar, no es una
    regresión de seguridad nueva.
  - Rust/WASM: nueva función `decrypt_group_ephemeral_image` en `core_api.rs` (mismo patrón
    AES-256-GCM que `seal_for_contact`/`open_from_contact`), expuesta en
    `crypto_wasm_bridge.js` como `decryptGroupEphemeralImage` — el descifrado pasa por WASM,
    no `crypto.subtle` directo, por la regla de `AGENTS.md`. Los stubs preexistentes
    `encryptMedia`/`decryptMedia`/`generateMediaKey` quedaron sin tocar (no se necesitan acá,
    el cifrado ocurre en el servidor).
  - Frontend: `chat_input.js` sube la imagen una sola vez (`uploadGroupEphemeralImage`) en
    vez de embeberla N veces (una por miembro) y manda solo un puntero
    (`group_ephemeral_image_ptr`, `{group_id, image_id}`) por el canal E2E existente.
    `sync_manager.js` intercepta ese tipo, hace fetch+descifra, y reescribe `payload.text`
    ANTES de entrar a la rama unificada que ya manejaba `group_chat`/`group_ephemeral_image`
    — cero cambios en `ephemeral_store.js`/`message_renderer.js`/notificaciones/recibos.
    `message_renderer.js` llama a `markGroupEphemeralImageViewed` al terminar la cuenta
    regresiva de 10s, ADEMÁS del `ephemeral_viewed` E2E existente (sin tocar, sigue
    alimentando el contador "VISTO POR: x/y" del emisor).
  - **Bug real encontrado y corregido durante la verificación en vivo**: el primer intento
    fallaba con 404 ("Image not found or not authorized") para los dos receptores. Causa:
    `member_ids` se mandaban como alias planos (`grp.members.filter(...)`, ej. "eimgbob1")
    pero `get_image()` compara contra `requester_id`, que es un hash SHA-256 (mismo
    `user_hash` que usa todo el resto de `api.py`) — nunca coincidían. Fix: hashear cada
    alias en `uploadGroupEphemeralImage` antes de mandarlos (`sha256` ya usado en todo
    `sync_manager.js` para `senderHash`/`receiverHash`).
  - Verificado en vivo con 3 cuentas reales (`eimgalice1`/`eimgbob1`/`eimgcarol1`, grupo
    `#eimgtest`): imagen subida por Alice (`POST /api/media/group-ephemeral-image` → 200,
    log del backend "Imagen ... almacenada en RAM. Viewers needed: 2"), recibida y
    descifrada correctamente por Bob y Carol (sin errores de consola tras el fix), cuenta
    regresiva de 10s funcionando, y tras que ambos la vieron el backend logueó "Imagen ...
    eliminada: todos la vieron." (limpieza server-side real, no solo local). El lado emisor
    (Alice) también purgó su propia copia local vía el `ephemeral_viewed` E2E sin cambios.
    Regresión: imagen efímera 1:1 y mensaje de texto normal de grupo confirmados sin cambios
    de comportamiento en la misma sesión de pruebas.
  - Test suite backend: 46/46 pasando (Docker rebuild + pytest), sin regresiones — el único
    fallo visto (`test_ws_manager_multi_connection_and_disconnect`) es preexistente y no
    relacionado (falta el plugin `pytest-asyncio` en el entorno, no una falla de código).
- ~~`websocket_handler.py`, `message_queue.py`, `mutable_buffer.py`: código muerto.~~
  **Resuelto — borrados.** `message_queue.py`/`mutable_buffer.py` no tenían ninguna
  referencia (ni en `api.py` ni en tests). `websocket_handler.py` resultó menos trivial: el
  propio módulo se autodocumenta como legacy ("el endpoint activo está en `api.py`") pero
  seguía teniendo un test real (`test_hybrid_encryptor.py::test_websocket_nonce_validation`)
  Y una entrada en `traceability/requirements.json` (`REQ-MEM-001`, prioridad CRITICAL,
  con spec formal TLA+) que lo listaba como una de las cuatro implementaciones de
  zeroización de memoria — ninguna de las dos cosas era código fantasma real, pero tampoco
  reflejaban nada que corriera en producción: la validación de nonce del WS activo la hace
  `global_registry.claim_relay_nonce`/`commit_relay_nonce` (mecanismo anti-replay,
  conceptualmente distinto), no `websocket_handler.py::validate_nonce`. Se borraron los tres
  módulos, el test que solo ejercitaba el módulo muerto, y la referencia en
  `requirements.json` (las otras 3 implementaciones de zeroización listadas ahí siguen
  intactas, el requisito no dependía únicamente de este módulo). Verificado: build de Docker
  limpio + 33/33 tests (antes 34, uno menos por el test borrado).
- ~~Mnemónico de recuperación: 96 bits de entropía, no los 128 de un BIP-39 estándar.~~
  **Resuelto** — ver sección "frase de recuperación real" arriba (wordlist BIP-39 de 2048
  palabras, 128 bits reales).
~~`hermes_ffi_core`/`hermes_replay_sql` (Rust): nunca compilados en este entorno, no
  auditados en profundidad más allá de lo que exige el punto 6.~~ **Auditado — bug real
  encontrado y arreglado.** Código pequeño (~640 líneas entre los dos crates), leído
  completo en vez de muestreado. Windows sigue sin poder compilarlo (falta dlltool/MSVC,
  mismo límite que el punto 6) — auditado compilando en Linux (`rust:1-slim-bookworm` vía
  Docker, mismo patrón que el harness de `Dockerfile.backend.native-test`).
  - `cargo build` de `hermes_ffi_core` compila limpio. `cargo test` del mismo crate **fallaba
    con 21 errores de compilación** (`E0061`, número de argumentos incorrecto) — el trait
    `ReplayStore::{claim,commit,reject}` se extendió en algún momento para agregar
    `domain: &str` y `ttl_seconds: u64`, pero los tests de `replay/mod.rs` (flujo
    claim/commit, reject, release, token inválido, expiración de TTL, y una prueba de
    concurrencia real con 100 threads compitiendo por el mismo hash) nunca se actualizaron
    para el nuevo signature. Es decir: la lógica de estado del anti-replay en memoria
    (`InMemoryReplayStore`) tenía **cero tests ejecutables**, no solo tests desactualizados
    de forma cosmética — `cargo test` ni compilaba.
    - Esto importa porque `InMemoryReplayStore` **no es código muerto**: `hermes_ffi_py`
      (`rust/hermes_ffi_py/src/lib.rs`) lo expone a Python como `NativeReplayRegistry`, y
      `otp_registry.py` usa `HERMES_REPLAY_BACKEND=memory` **por defecto** — el backend SQL
      (`SqlReplayRegistry`, `hermes_replay_sql`) solo se usa si se setea explícito
      `HERMES_REPLAY_BACKEND=sql`, algo que `otp_registry.py` sí exige de forma fail-closed
      cuando `HERMES_ENV=production`. O sea: en cualquier entorno que no sea producción
      (dev, staging, un despliegue de instancia única sin `HERMES_REPLAY_BACKEND` seteado),
      el anti-replay real corre sobre esta lógica sin ningún test automatizado corriendo.
    - **Fix**: actualizados los 6 tests con el signature correcto (agregado un dominio y TTL
      constantes al módulo de test). Verificado: los 6 pasan, incluida la prueba de
      concurrencia (100 threads compitiendo por el mismo hash → exactamente 1 éxito, 99
      `AlreadyClaimed`, confirmando que el `Mutex` realmente serializa las claims).
    - `hermes_ffi_py/src/lib.rs` (el binding real usado en producción) ya llamaba al
      trait con el signature correcto en los dos backends (`NativeReplayRegistry` y
      `SqlReplayRegistry`) — el bug estaba contenido a los tests del crate, no al código que
      corre de verdad. No se tocó nada de `hermes_ffi_py` ni de `hermes_replay_sql`.
  - `hermes_replay_sql` (el backend SQL, el que exige producción) **no tiene ningún test
    propio** (`grep` de `#[cfg(test)]` en su único archivo fuente: cero resultados) — su
    única verificación hasta ahora es la corrida manual contra MySQL real de la sesión
    anterior (punto 6), que no es un test repetible en CI. Revisado el código a mano: el
    `claim`/`commit`/`reject`/`release` mapean 1:1 al mismo diseño que `InMemoryReplayStore`
    (mismo contrato del trait, mismo manejo de expiración vía `expires_at`), con
    `INSERT ... ON DUPLICATE` capturando el código de error 1062 de MySQL para traducir a
    `AlreadyClaimed` — no se encontró ningún problema de lógica leyéndolo, pero queda sin
    test automatizado propio. No implementado (agregar tests de integración con MySQL real
    requeriría infraestructura de CI con una DB de prueba, fuera del alcance de esta pasada).
- ~~Workflows de CI (`.github/workflows/`): no auditados esta sesión.~~
  **Auditado — 2 workflows rotos de verdad, encontrados y arreglados con evidencia
  reproducida localmente, no inferencia.** Los 4 archivos (`python.yml`, `rust.yml`,
  `security_ci.yml`, `zap.yml`) son chicos, se leyeron completos.

- **`python.yml` (CI principal de backend) y `zap.yml` (DAST semanal) instalaban un
  subconjunto de dependencias mantenido a mano en vez de `pip install -r requirements.txt`,
  y ese subconjunto no incluía `pqcrypto`** — la librería que usan `kyber_manager.py`/
  `sphincs_manager.py` con un `import` de nivel de módulo. Cualquier cosa que importe
  `hermes_backend.network_core.api` (o cualquier módulo de `crypto_core`) explota con
  `ModuleNotFoundError: No module named 'pqcrypto'` antes de ejecutar una sola línea real.
  - Reproducido de punta a punta en un contenedor `python:3.13-slim` limpio replicando
    exactamente los pasos del workflow: `pytest tests/test_hybrid_encryptor.py
    tests/phase7_audit.py` fallaba en la fase de *collection* (ni siquiera llegaba a correr
    un test) con exactamente ese `ModuleNotFoundError`. Mismo resultado arrancando
    `uvicorn hermes_backend.network_core.api:app` como hace `zap.yml` antes de lanzar el
    escaneo — crashea en el import, jamás levanta un servidor real que ZAP pueda atacar.
  - **Impacto real**: `test_hybrid_encryptor.py` es la cobertura de test declarada para
    `REQ-CRYPTO-001` (prioridad CRITICAL en `traceability/requirements.json` — cifrado
    híbrido ML-KEM-1024 + AES-256-GCM + SPHINCS+). Si este workflow viene fallando así desde
    que `pqcrypto` se agregó a `requirements.txt` (o desde que se escribió el workflow), la
    evidencia formal de ese requisito crítico nunca corrió en CI — solo se ejecutó cuando se
    corrió pytest manualmente en este repo (como se hizo varias veces esta sesión). El job de
    ZAP tiene el mismo problema: probablemente nunca escaneó un backend real.
  - **Fix**: los dos workflows ahora hacen `pip install -r requirements.txt` en vez de listar
    paquetes a mano; `python.yml` retiene aparte solo las herramientas que son de CI/test y
    no pertenecen a `requirements.txt` (`pytest`, `pytest-cov`, `hypothesis`, `bandit`,
    `semgrep`, `requests` — este último lo necesita `tests/phase7_audit.py`, encontrado
    también al reproducir el fix y ver que rompía por `ModuleNotFoundError: requests`).
  - Verificado en el mismo contenedor limpio, con el fix aplicado: `pytest
    tests/test_hybrid_encryptor.py tests/phase7_audit.py` → **10 passed**; `uvicorn
    hermes_backend.network_core.api:app` arranca limpio y `GET /docs` responde `200`.
  - Nota menor, no arreglada: `tests/phase7_audit.py` no tiene ninguna función `test_*` ni
    clase `Test*` (es un script standalone con su propio `if __name__ == "__main__":`,
    pensado para correrse directo con `python tests/phase7_audit.py` contra un servidor
    real, no vía pytest) — pytest lo importa sin error pero recolecta cero tests de ahí.
    Incluirlo en el comando de `pytest` no rompe nada pero tampoco ejecuta su lógica de
    auditoría; queda como está, no es parte del bug reportado acá.
- ~~Los tres crates de `rust/` (`hermes_ffi_core`, `hermes_ffi_py`, `hermes_replay_sql`) no
  aparecen en NINGÚN workflow.~~ **Resuelto — workflow nuevo `.github/workflows/rust_ffi.yml`,
  3 jobs.** Esto explicaba directamente por qué el bug de tests de `hermes_ffi_core` sin
  compilar (ver más abajo) pasó desapercibido: no había ningún job que pudiera detectarlo.
  - `test_ffi_core`: `cargo fmt --check` + `cargo clippy -D warnings` + `cargo test` para
    `hermes_ffi_core`. El crate nunca había pasado por `cargo fmt`/`clippy` — corriéndolos
    por primera vez rompían (10 diffs de formato + 1 lint real, `collapsible_if` en
    `memory.rs`). Arreglados los dos antes de habilitar el check en modo estricto (mismo
    nivel de rigor que ya exige `rust.yml` para `hermes_crypto_wasm` — si no, el job nace
    rojo el día uno, el mismo problema que ya se encontró y arregló en `python.yml`/`zap.yml`).
  - `build_ffi_py`: compila `hermes_ffi_py` (que arrastra transitivamente a `hermes_ffi_core`
    y `hermes_replay_sql`) con `python3-dev`/`pkg-config`/`libssl-dev` instalados —
    confirmado en local que sin `python3-dev` el build de `pyo3-ffi` falla con "no Python 3.x
    interpreter found" pese a que la feature `extension-module` no linkea contra libpython
    (el build script de pyo3 igual necesita sondear el intérprete).
  - `test_replay_sql`: **`hermes_replay_sql` nunca había tenido NINGÚN test propio** (su única
    verificación histórica era la corrida manual contra MySQL de la sesión del ítem 6). Se
    agregó un módulo `#[cfg(test)]` real en `rust/hermes_replay_sql/src/lib.rs` — mismos 5
    escenarios que ya cubren los tests de `hermes_ffi_core` (claim/commit, reject, release,
    token inválido, expiración de TTL) más `health_check` y una prueba de concurrencia real
    con 20 threads reclamando el mismo hash a la vez (acá lo que serializa no es un `Mutex`
    local sino la restricción `UNIQUE`/`PRIMARY KEY` de MySQL, atrapada como error 1062 →
    `AlreadyClaimed`). Los tests se saltan solos (no fallan) si `TEST_DATABASE_URL` no está
    seteada, para que `cargo test` en una máquina sin MySQL siga siendo rápido y hermético; el
    job de CI sí levanta un `service: mysql:8` real y aplica `schema.sql` antes de correrlos.
  - Verificado dos veces en local, no solo leído: levanté un `mysql:8` real en Docker
    (contenedor + red aparte, sin reusar el de dev), apliqué `schema.sql`, y corrí
    `cargo test` con `TEST_DATABASE_URL` apuntando ahí — **6/6 passed**, incluida la
    concurrencia (20 threads → exactamente 1 éxito, 19 `AlreadyClaimed`). Repetido sin la
    variable seteada para confirmar que se saltan limpio (6/6 "ok" sin tocar la red). `cargo
    fmt --check`/`clippy -D warnings` limpios en las tres crates después de los arreglos.
    Contenedor y red de prueba destruidos al terminar, no quedaron corriendo.
