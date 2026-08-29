# 🛡️ Modelo de Seguridad y Amenazas - HermesChat

Este documento describe el estado de seguridad vigente para el backend HermesChat, las mitigaciones implementadas y las garantías que pueden verificarse en el código actual.

---

## 1. Estado de Madurez de Seguridad

| Área | Estado | Detalle / Referencia |
| :--- | :--- | :--- |
| **Arquitectura** | En producción | Backend blind relay, cliente cifrado E2E. El motor nativo Rust/WASM es obligatorio en producción. |
| **Implementación Criptográfica** | Activa | Kyber-1024 y SPHINCS+ en Python/FFI. |
| **Auditoría interna** | Parcial | Revisión de código, tests unitarios y pruebas de integridad de endpoints. |

---

## 2. Controles de Seguridad Implementados

### 2.1 Autenticación y sesión
* `SESSION_SECRET` obligatorio y con longitud mínima 32 bytes.
* Tokens de sesión HMAC-SHA256 con expiración configurada por `SESSION_TTL_SECONDS`.
* Validación de token estricta con `hmac.compare_digest()`.

### 2.2 Protección de origen y cabeceras HTTP
* `ALLOWED_ORIGINS` configurado y validado; `*` está prohibido.
* `add_security_headers` agrega `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, `Referrer-Policy`, `Permissions-Policy` y `Strict-Transport-Security` en producción.
* CORS activo solo sobre orígenes permitidos; métodos restringidos y headers declarados.

### 2.3 Anti-replay y validación de firma
* `verify_client_signature()` verifica firmas SPHINCS+ sobre timestamps.
* Tolerancia de tiempo limitada a 300 segundos para mitigar replays.
* `ReplayRegistry` / `OTPKeyRegistry` implementa `claim` / `commit` / `release` para dominios de API, envelope y relay.
* Los relays de blobs usan `claim_relay_nonce()` y `commit_relay_nonce()` para asegurar at-most-once delivery.

### 2.4 Límite de payload y desacoplo
* `PayloadSizeLimitMiddleware` rechaza cargas útiles demasiado grandes: 100 KB para señalización y 10 MB para blobs cifrados.
* `RateLimiter` aplica límites por IP y por cliente en endpoints REST y WS.
* `ConnectionLimiter` limita nuevas conexiones WebSocket y concurrencia máxima.

### 2.5 Manejo seguro de errores y logging
* `global_exception_handler` devuelve un error genérico sin exponer detalles internos.
* `AmnesiaEnforcer` remueve handlers de archivo, fuerza logs solo a stdout y redacta valores sensibles.
* Los mensajes de log se sanitizan para remover `\r`, `\n` y `\t`.

### 2.6 Zeroization en buffers sensibles
* `safe_zeroize()` borra en sitio `bytearray` y `memoryview` tras operaciones sensibles.
* `HybridPQCEncryptor.encrypt()` y `HybridPQCEncryptor.decrypt()` usan `safe_zeroize()` para limpiar `shared_secret` y `aes_key`.

### 2.7 Fallback seguro para producción
* En `hermes_backend/crypto_core/native_core.py`, el motor nativo Rust/WASM es obligatorio en `production`.
* Si `hermes_ffi` no está disponible en modo `production`, el arranque se aborta.
* El fallback Python `pqcrypto` solo es aceptable en desarrollo o pruebas internas.

---

## 3. Modelo de Amenazas

Se asume que un adversario puede:
* controlar la red e intentar MITM,
* comprometer la infraestructura de relay,
* capturar mensajes cifrados para descifrado futuro.

### Supuestos
1. El backend es un relay ciego y no se confía en él para descifrar mensajes.
2. El cliente ejecuta el código en un dispositivo no comprometido.
3. Los canales Out-of-Band se usan para verificar huellas de clave cuando sea necesario.

---

## 4. Alcance de Protección

| Escenario | Estado | Comentario |
| :--- | :---: | :--- |
| Servidor comprometido | ✔ Protegido | El relay no conoce el contenido de mensajes cifrados ni claves de sesión. |
| Replay de mensajes | ✔ Protegido | Uso de reclamos de nonce firmados y expiración. |
| Fuga de logs sensibles | ✔ Protegido | Logs sanitizados y valores redactados. |
| Compromiso de dispositivo cliente | ✘ No protegido | Malware local invalida el modelo. |
| Captura de sesión activa | ✘ No protegido | El dispositivo desbloqueado sigue siendo un riesgo. |
| Cadena de suministro preruntime | ✘ No cubierto | Este documento no asegura compilaciones externas previas. |

---

## 5. Security Claims y Evidencia

| Claim | Referencia de Código | Verificación |
| :--- | :--- | :--- |
| Sesiones HMAC con expiración | `hermes_backend/network_core/api.py` | Revisión de `generate_session_token()` y `verify_session_token()`. |
| Orígenes permitidos y CORS estricto | `hermes_backend/network_core/api.py` | Revisión de `allowed_origins` y `CORSMiddleware`. |
| Anti-replay de API y WS | `hermes_backend/network_core/api.py`, `hermes_backend/network_core/otp_registry.py` | Inspección de `verify_client_signature()`, `claim_api_signature()`, `claim_relay_nonce()`. |
| Sanitización de logs | `hermes_backend/network_core/amnesia_enforcer.py` | Inspección de `SensitiveDataRedactor` y `configure_amnesia_logging()`. |
| Zeroize de material sensible | `hermes_backend/crypto_core/hybrid_encryptor.py`, `hermes_backend/crypto_core/zeroize.py` | Inspección de `safe_zeroize()` y llamadas en `encrypt`/`decrypt`. |
| Producción exige motor nativo | `hermes_backend/crypto_core/native_core.py` | Revisión del bloqueo de arranque en modo `production` sin `hermes_ffi`. |

---

## 6. Programa de Divulgación de Vulnerabilidades (VDP)

* **Contacto:** `security@hermes.chat`
* **Acuse:** 48 horas.
* **Evaluación:** 5 días.
* **Resolución:** 15-30 días según criticidad.
* **Safe Harbor:** Investigadores de buena fe no serán penalizados.
* **Embargo recomendado:** 90 días para coordinación de parches.
