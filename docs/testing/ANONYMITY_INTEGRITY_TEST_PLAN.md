# Test Plan: Anonymity & Data Integrity (Blind Relay)

Alcance: verificar que `hermetic.onrender.com` es un relay ciego de verdad **contra el entorno real de Render** (proxy inverso, red interna, Postgres gestionado) — no solo por lectura de código. Este plan retoma un punto que había quedado pendiente de una revisión anterior: nunca se llegó a inspeccionar un log real del Web Service (por error se revisaron logs de la base de datos, que no sirven para esto — ver §1).

## 1. Execution Matrix

| Test | Cómo correrlo | Evidencia |
|---|---|---|
| Anonimización de IP contra proxy real | Pedir logs del **Web Service** `hermeticos-backend` en el dashboard de Render (Logs tab) — NO los de la base `hermeticos-db`, esos son conexiones internas Render→Postgres, no usuarios | Líneas `HERMES_AMNESIA \| ... \| BLIND_RELAY \| <hash> \| <method> \| <ip>` |
| Headers de seguridad reales | `curl -sI https://hermetic.onrender.com/` | Headers CSP/HSTS/X-Frame-Options |
| Terceros / fugas de red | DevTools → Network, filtrar por dominio, en una sesión real de chat | Lista de dominios contactados |
| Anti-replay real | Reenviar signature+timestamp ya usada contra `/api/login` | 401 `Invalid signature` en el segundo intento |
| Esquema de Postgres | `psql "$DATABASE_URL_EXTERNA" -c "\d users" -c "\d cloud_backups"` | Columnas de la tabla |

## 2. Anonimización de IP (§ pendiente de la revisión anterior)

| Caso | Pasos | Resultado esperado | Estado |
|---|---|---|---|
| 2.1 IP real nunca aparece en logs | Hacer 2-3 requests de prueba (registro/login) desde una IP conocida propia, revisar logs del Web Service inmediatamente después | La IP real (la del que hizo el request) **no aparece en ningún lado** — solo el valor ya anonimizado de `request.state.blind_ip` | ✅ Ninguna IP pública real apareció nunca en los logs |
| 2.2 Formato de anonimización correcto | Mismo log que 2.1 | El campo IP en `HERMES_AMNESIA` tiene el último octeto en `0` | ✅ Confirmado (`10.194.147.0`, `10.198.26.0`, etc. — último octeto siempre `0`) |
| 2.3 `X-Forwarded-For`/`CF-Connecting-IP` del proxy real, no falsificable por el cliente | ~~Repetir 2.1 con un header `X-Forwarded-For` falso~~ | ~~El log no debe reflejar el valor falso~~ | ❌ **Bug real confirmado y arreglado (2026-08-29)**: los logs reales mostraban **exclusivamente rangos privados `10.x.x.x`** — `privacy_middleware.py::dispatch` leía `request.client.host` (el peer TCP directo del transporte ASGI), que en Render es la IP INTERNA del proxy de Render, nunca la del usuario real (Render pone Cloudflare delante incluso del dominio `.onrender.com` crudo — confirmado con `curl -sI` contra producción, headers `Server: cloudflare`+`CF-RAY`). Esto significaba que la "anonimización" operaba sobre un dato que ya no identificaba a nadie, Y que el rate-limiting por IP (`{ip}_login`, `{ip}_register`, etc.) compartía el mismo puñado de buckets (uno por nodo interno de Render) entre TODOS los usuarios reales, en vez de limitar por usuario. **Fix aplicado**: leer `CF-Connecting-IP` primero (Cloudflare lo sobreescribe siempre en su borde, no falsificable por quien llega al origin) con fallback a `request.client.host` para dev local. Verificado con `curl -H "CF-Connecting-IP: 203.0.113.55"` local → log mostró `203.0.113.0` correctamente. **Pendiente**: verificar contra producción real tras el redeploy — repetir 2.1/2.2 y confirmar que ahora aparecen rangos de IP públicos reales (anonimizados), no más `10.x.x.x`. |
| 2.4 uvicorn no logea la IP real por su cuenta | Revisar que no aparezcan líneas `INFO: <ip> - "GET ... HTTP/1.1" 200` con IP real en los logs | `--no-access-log` está activo en el `CMD` de `Dockerfile.backend.production` | ✅ Confirmado — logs reales solo muestran líneas `HERMES_AMNESIA`, ningún access-log de uvicorn con IP |

## 3. Ausencia de contenido/metadata sensible

| Caso | Pasos | Resultado esperado |
|---|---|---|
| 3.1 Contenido de mensajes nunca en logs | Enviar un mensaje 1:1 con un marcador único de texto (p.ej. `AUDIT-MARKER-<random>`) en el plaintext, revisar logs del Web Service en la ventana de esa request | El marcador no aparece en ningún log — el relay solo debería ver el envelope cifrado |
| 3.2 Contenido de mensajes nunca en Postgres | Mismo marcador, `psql` contra `cloud_backups`/`replay_claims`/`users` buscando el string | Cero coincidencias — `cloud_backups.encrypted_data` debe ser hex de ciphertext, no texto plano |
| 3.3 Esquema sin columnas de IP/user-agent/contenido | `psql "$DATABASE_URL_EXTERNA" -c "\d users" -c "\d cloud_backups" -c "\d user_relationships"` | Ninguna tabla tiene columnas `ip_address`, `user_agent`, `last_seen_ip`, o de contenido de mensajes — solo hashes, claves públicas, y blobs ya cifrados |
| 3.4 `user_relationships` solo tiene el par opaco | `psql` sobre `user_relationships` | Solo `user_hash`, `relationship_type`, `target_id`, `created_at` — nada que identifique nombre/alias en claro más allá del hash público |

## 4. Superficie de terceros

| Caso | Pasos | Resultado esperado |
|---|---|---|
| 4.1 Sin analytics/CDN/fonts externos | Abrir `hermetic-eight.vercel.app`, hacer login, enviar un mensaje, revisar DevTools → Network durante todo el flujo | Todos los requests van a `hermetic-eight.vercel.app` (mismo origen) o `hermetic.onrender.com` (rewrite de `/api`, `/ws`) — cero requests a Google/analytics/CDNs de fuentes/etc. |
| 4.2 Sin fugas por error/crash reporting | Forzar un error de cliente (p.ej. desconectar red a mitad de un envío) | Ningún request sale a un servicio externo de error-tracking (Sentry, etc. — no debería haber ninguno instalado, confirmar que se mantiene así) |

## 5. Propiedades criptográficas del recovery proof (auditoría de código, no request)

| Propiedad | Dónde se verifica | Por qué importa |
|---|---|---|
| 5.1 El proof no permite derivar la clave de backup | `hermes_crypto_wasm/src/core_api.rs::derive_recovery_proof` — confirmar que usa un `info` de HKDF **distinto** al de la clave de cifrado del backup | Si compartieran el mismo `info`, el servidor (que sí ve el proof) podría derivar la clave y descifrar los backups — rompería el zero-knowledge |
| 5.2 El servidor nunca ve la mnemónica | Grep de `mnemonic`/`recovery phrase` en `hermes_backend/` — no debe existir ningún endpoint que reciba la frase completa, solo el `proof_hex` derivado | La mnemónica nunca debe cruzar la red |

## 6. Anti-replay real (no solo por lectura del código)

| Caso | Pasos | Resultado esperado |
|---|---|---|
| 6.1 Replay de login | Capturar un `timestamp`+`signature` válido de un login exitoso (ver consola, `hermesBridge.computeAdminSig`), reenviar el mismo par exacto a `/api/login` | Segundo intento → 401 (`AlreadyClaimed` mapeado a "Invalid signature"), no un login exitoso duplicado |
| 6.2 Replay de relay | Reenviar el mismo envelope firmado dos veces a `/api/relay` | Segundo intento rechazado — el dominio `HERMES-REPLAY-ENVELOPE-V1` no debe permitir consumir el mismo hash dos veces |
| 6.3 Ventana de tolerancia de timestamp | Firmar con un timestamp `now - 301` (fuera de la ventana de 300s) | Rechazado antes de tocar la base — ver `docs/testing/REPLAY_HARDENING_TEST_PLAN.md` §3 para los casos ya cubiertos por unit tests, esto es la confirmación en producción real |

## 7. Aislamiento entre usuarios

| Caso | Pasos | Resultado esperado |
|---|---|---|
| 7.1 No se puede leer el backup de otro usuario | Autenticado como usuario A (token de sesión de A), llamar `/api/backup/fetch` con `user_hash` de un usuario B real | Debe devolver los backups de A (el `user_hash` del body se ignora o se valida contra la sesión) — nunca los de B, sin importar qué `user_hash` se mande en el payload |
| 7.2 No se puede purgar la cuenta de otro | Con sesión de A, llamar `/api/user/purge` intentando afectar a B | Solo afecta a la cuenta de la sesión autenticada (A) |
