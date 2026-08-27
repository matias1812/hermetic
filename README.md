# 🔐 HermesChat vFinal — Backend Blind Relay con PQC y Hardened MVP Candidate

## 🧾 Estado Actual
**MVP Hardened / Candidate** — el backend FastAPI está endurecido con protección de API, WebSockets, validación de origen, límites de trama y sanitización de logs.

**Auditoría 2026-08-27:** revisión completa del backend, el núcleo Rust/WASM y el frontend.
Se encontraron y arreglaron dos bypasses completos de autenticación (`/api/login` y el
handshake WebSocket no verificaban nada — ver `git log`), el cliente web pasó de usar
X25519 disfrazado de "Kyber" a **ML-KEM-1024 real**, y se cerraron varias fugas de
cifrado silencioso (bóveda local, multimedia, intercambio de claves de contacto/grupo).
Detalle completo y lo que queda pendiente: **[`BACKLOG.md`](BACKLOG.md)**.

## 🚀 Resumen del Proyecto
HermesChat es un servidor de relevo ciego que enruta mensajes cifrados de extremo a extremo sin almacenar claves privadas. El backend opera como un puente seguro para paquetes cifrados y firmas PQC, mientras la lógica de sesión y de cifrado se mantiene en el cliente nativo/FFI.

## ✅ Características Clave
- Post-cuántico: **Kyber ML-KEM-1024** para intercambio de clave híbrido.
- Firmas: **SPHINCS+** para autenticación de paquetes.
- AEAD: **AES-256-GCM** para confidencialidad e integridad.
- Fail-Closed: fallos criptográficos abortan la operación.
- Zeroization: `safe_zeroize()` limpia buffers sensibles en Python.
- WebSockets hardened: origen validado, autenticación en 5s, límite de 64KB y 10 mensajes/s.
- Logging seguro: sanitización CRLF y redacción de secretos.

## 📌 Variables de Entorno Requeridas
| Variable | Descripción | Requerido |
|---|---|:---:|
| `SESSION_SECRET` | Clave HMAC para tokens de sesión. Debe ser al menos 32 caracteres. | Sí |
| `ALLOWED_ORIGINS` | Lista separada por comas de orígenes HTTP/HTTPS permitidos. `*` no está permitido. | Sí |
| `HERMES_ENV` | `production` para habilitar HSTS y controles de seguridad estrictos. | No |
| `MAX_WS_CONNECTIONS` | Límite de conexiones WS simultáneas (default `1000`). | No |
| `WS_MAX_FRAME_SIZE` | Límite de trama WS en bytes (default `65536`). | No |
| `WS_MESSAGES_PER_SECOND` | Límite de mensajes WS por segundo (default `10`). | No |

## 🧪 Instalación y Ejecución
```bash
pip install -r requirements.txt

# Opcional: si compilas el puente Rust/WASM
pip install maturin
cd hermes_crypto_wasm
maturin develop

# Iniciar servidor con preflight audit (uso local — abre navegador, corre
# diagnósticos criptográficos interactivos, sirve dist/ si existe junto al backend)
python main.py

# O ejecutar directamente el ASGI app (recomendado en producción — main.py NO es
# el entrypoint de despliegue). --no-access-log es obligatorio: sin eso, uvicorn
# imprime la IP real de cada cliente en stdout, sin pasar por PrivacyMiddleware.
uvicorn hermes_backend.network_core.api:app --host 0.0.0.0 --port 8000 --no-access-log
```

## 🚀 Despliegue
`Dockerfile.backend` + `render.yaml` — ver **[`BACKLOG.md`](BACKLOG.md)** para el estado
actual y qué falta para un despliegue "producción real" (compilar `rust/hermes_ffi_py`,
provisionar MySQL/Postgres, `HERMES_ENV=production`). El `Dockerfile` en la raíz del repo
es para el build reproducible del WASM del cliente, **no** para correr el servidor.

## 📁 Documentación Clave
- `docs/ARCHITECTURE.md` — arquitectura del sistema y flujo de envelope PQC.
- `docs/SECURITY.md` — matriz de controles SEC-01 a SEC-07 y políticas de fail-closed.
- `docs/API_SPEC.md` — especificación REST/WS de backend para integradores.
- `docs/EVIDENCE_LOGS.md` — evidencia de compilación, pruebas y logs sanitizados.

## 🧾 Pruebas y Evidencia
```bash
python -m py_compile main.py hermes_backend/network_core/api.py hermes_backend/crypto_core/native_core.py hermes_backend/crypto_core/hybrid_encryptor.py
python -m pytest tests/ -q
```

## 📌 Nota de Estado
La implementación actual documenta un backend blind relay endurecido. La ruta nativa Rust/WASM es la intención de diseño; cuando no está disponible, el servidor puede ejecutar un fallback de backend Python `pqcrypto`.
