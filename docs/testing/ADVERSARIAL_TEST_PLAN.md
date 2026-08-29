# Test Plan: Adversarial / Above-Average User

Alcance: qué podría intentar un usuario malicioso o técnicamente avanzado contra `hermetic.onrender.com` en producción, endpoint por endpoint. Basado en el relevamiento real de rutas y límites de rate-limiting (`hermes_backend/network_core/api.py`), no en suposiciones genéricas de OWASP.

## 1. Superficie completa (referencia)

```
POST   /api/register              limit 50/60s   key {ip}_register
POST   /api/login                 limit 20/60s   key {ip}_login
POST   /api/logout
GET    /api/generate_keys
POST   /api/user/relationships    limit 100/60s  key {session_id}_{ip}_rel
DELETE /api/user/relationships    limit 100/60s  key {session_id}_{ip}_rel
GET    /api/user/state            limit 60/60s   key {session_id}_{ip}_state
DELETE /api/user/purge            limit 5/60s    key {session_id}_{ip}_purge
GET    /api/user/{id_hash}
GET    /api/blob/{blob_id}
POST   /api/blobs/clear           limit 5/60s    key {id_hash}_{ip}_clear
POST   /api/relay                 limit 100/60s  key {sender_hash}_{ip}
POST   /api/backup                limit 10/60s   key {user_hash}_{ip}_backup
POST   /api/backup/fetch          limit 20/60s   key {user_hash}_{ip}_fetchbkp
POST   /api/media/group-ephemeral-image          limit 10/60s   key ..._geimg_up
POST   /api/media/group-ephemeral-image/fetch    limit 30/60s   key ..._geimg_fetch
POST   /api/media/group-ephemeral-image/viewed   limit 30/60s   key ..._geimg_viewed
POST   /api/recovery/register-proof   limit 10/60s   key {user_hash}_{ip}_recovproof
POST   /api/recovery/fetch            limit 5/300s   key {id_hash}_{ip}_recovfetch  ← el más estricto
POST   /api/fetch                 limit 100/60s  key {id_hash}_{ip}
GET    /api/verify                limit 100/60s  key {ip}_verify
WS     /ws/{client_id}
```

WS: `MAX_WS_CONNECTIONS` (default 1000), `max_new_per_second=10`, `WS_MAX_FRAME_SIZE` (default 64KB), `WS_MESSAGES_PER_SECOND` (default 10, cierre 1008 si se excede), `WS_AUTH_TIMEOUT_SECONDS` (15s).

## 2. Identidad y sesión

| Caso | Intento | Resultado esperado |
|---|---|---|
| 2.1 Toma de cuenta por re-registro | `POST /api/register` con un `client_id` ya registrado, pero claves públicas distintas | 409 (ya fixeado en `db_connection.py::register_user` — confirmar en producción, no solo en tests) |
| 2.2 Login sin poseer la clave privada | `POST /api/login` firmando el timestamp con una clave SPHINCS+ distinta a la registrada para ese `client_id` | 401 `Invalid signature` |
| 2.3 Replay de firma con timestamp alterado | Tomar una firma válida capturada, mandarla con un `timestamp` distinto al firmado | 401 — la firma no corresponde al nuevo timestamp |
| 2.4 Sesión de un usuario usada para actuar como otro | Token Bearer válido de la cuenta A, usarlo en `/api/user/relationships` intentando registrar una relación a nombre de otro `user_hash` | El backend debe derivar el `user_hash` del token de sesión, no confiar en el que venga en el body |
| 2.5 Logout no revocado sigue funcionando | Llamar `/api/logout`, reintentar un endpoint autenticado con el mismo token | 401 — el JTI debe quedar revocado (`global_registry.revoke_jti`) |

## 3. Fuerza bruta y rate limiting

| Caso | Intento | Resultado esperado |
|---|---|---|
| 3.1 Fuerza bruta de recovery phrase | 6+ intentos de `/api/recovery/fetch` con proofs incorrectos en <5 min, mismo `id_hash` | El 6to intento (y siguientes) → 429, no 401 — confirma que el rate limit corta antes de agotar intentos |
| 3.2 Bucket de rate-limit: IP real vs. `blind_ip` | Repetir 3.1 desde dos IPs distintas dentro de la misma subred /24 (mismo último octeto zeroizado) | Documentar el resultado real: si comparten cuota (`blind_ip` en la key) o no (IP real en la key) — ambos comportamientos tienen implicancias a documentar (compartir cuota = usuarios legítimos en la misma red podrían bloquearse entre sí; no compartir = un atacante no puede evadir el límite rotando IP en la misma subred) |
| 3.3 Fuerza bruta de login | 21+ intentos de `/api/login` con firma inválida en 60s, mismo IP | 21vo intento → 429 |
| 3.4 Bypass de rate-limit por IP anonimizada | Si el rate-limit usa `blind_ip` (último octeto en 0), ¿un atacante que solo controla el último octeto de su IP podría evadir el límite total sin que cuente como "otro" bucket? | Documentar: como el límite ya usa la IP con el octeto zeroizado, cambiar SOLO el último octeto no debería dar un bucket nuevo (mismo `blind_ip`) — confirmar empíricamente si es factible desde dos IPs reales controladas |

## 4. Manipulación de estado / integridad

| Caso | Intento | Resultado esperado |
|---|---|---|
| 4.1 Downgrade de backup | Subir un backup con `vectorClock`/`timestamp` manipulado para simular ser "más nuevo" que el real, pero con datos viejos | Confirmar cómo resuelve el backend — hoy `save_cloud_backup` no valida vector clock server-side (la resolución de conflictos es client-side, `ConflictResolver`), así que el server aceptaría el backup igual; el riesgo real es si el PRÓXIMO fetch por otro dispositivo aplica el estado viejo como si fuera el más nuevo. Documentar como hallazgo si se confirma, no asumir. |
| 4.2 Backup gigante repetido (abuso de cuota) | Subir el backup máximo permitido (10MB, límite de payload) repetidamente hasta el límite de 10/60s | 413 sobre el límite de tamaño, 429 sobre el límite de frecuencia — confirmar cuál dispara primero y que no hay forma de acumular almacenamiento indefinido sin límite de cantidad total de backups por usuario |
| 4.3 `parent_id` arbitrario en backup | Mandar un `parent_id` que apunte al `backup_id` de OTRO usuario | No debe haber ninguna forma de que esto filtre o vincule datos entre cuentas — `parent_id` es solo un campo opaco del propio historial |

## 5. Contenido malicioso

| Caso | Intento | Resultado esperado |
|---|---|---|
| 5.1 XSS en alias | Alias con `<script>alert(1)</script>` (dentro del regex permitido `[a-zA-Z0-9_-]{3,20}`, así que en la práctica está bloqueado por el propio formato — confirmar que el regex realmente lo impide) | Rechazado en validación de formato, ni siquiera llega a persistirse |
| 5.2 XSS en nombre de grupo / mensaje | Nombre de grupo o texto de mensaje con payload HTML/`<img onerror=...>` | Debe renderizarse como texto plano en el DOM del receptor (verificar `message_renderer.js` usa `textContent`, no `innerHTML`, para contenido de usuario) |
| 5.3 SVG como imagen efímera | Subir un `.svg` (puede contener `<script>`) a `/api/media/group-ephemeral-image` | 400 `File is not a recognized raster image` — fix ya aplicado (`_is_known_raster_image`, valida bytes reales, no el content-type declarado) — confirmar en producción real |
| 5.4 Polyglot de imagen | Archivo con firma PNG/JPEG válida en los primeros bytes pero payload malicioso concatenado después | La validación actual solo mira la firma inicial — documentar como limitante conocida si aplica, no necesariamente un hallazgo nuevo (el archivo igual se sirve como blob cifrado, nunca se ejecuta server-side) |

## 6. Límites de payload y WebSocket

| Caso | Intento | Resultado esperado |
|---|---|---|
| 6.1 Payload de señalización > 100KB | POST a `/api/login` o similar con body >100KB | 413 `Payload Too Large` |
| 6.2 Payload de relay/backup > 10MB | POST a `/api/relay` o `/api/backup` con body >10MB | 413 |
| 6.3 Frame WS > 64KB | Mandar un mensaje WS de más de `WS_MAX_FRAME_SIZE` | Conexión cerrada |
| 6.4 Flood de mensajes WS | Más de 10 msg/seg por el mismo `client_id` | `{"type":"error"}` seguido de cierre `1008 Policy Violation` |
| 6.5 Flood de conexiones nuevas | Más de 10 conexiones WS nuevas por segundo desde el mismo origen | `ConnectionLimiter` debe throttlear/rechazar antes de agotar `MAX_WS_CONNECTIONS` |

## 7. CORS y enumeración

| Caso | Intento | Resultado esperado |
|---|---|---|
| 7.1 CORS con origen no permitido | `curl -H "Origin: https://evil.example.com" https://hermetic.onrender.com/api/user/state` | Sin header `Access-Control-Allow-Origin` para ese origen — el navegador bloquearía la respuesta aunque el server responda 200 al body |
| 7.2 Enumeración de alias válidos | `GET /api/user/{id_hash}` con hashes de aliases probables vs. aleatorios | Confirmar que la respuesta (código/cuerpo) es indistinguible entre "no existe" y "existe pero inactivo" — si difiere, permite enumerar cuentas registradas |

## 8. Controles de UX que NO son controles de seguridad (para no confundir hallazgos)

| Caso | Nota |
|---|---|
| 8.1 Bypass del modal "confirmá 2 palabras" al registrarse | Es fricción de UX para forzar que el usuario realmente anote la frase — bypassearlo vía DOM (p.ej. `modalManager.mandatoryRecoveryPhrase` resuelto manualmente desde consola) no compromete nada: la seguridad real está en que `/api/recovery/fetch` exige el `proof_hex` correcto, derivado criptográficamente de la frase real. Un atacante que bypasea el modal sin conocer la frase real de otro usuario no gana nada. |
| 8.2 Editar el DOM para "confirmar" un backup que falló | No cambia el estado real del servidor — cualquier verificación debe hacerse contra `/api/backup/fetch`, nunca contra el estado visual del modal |
