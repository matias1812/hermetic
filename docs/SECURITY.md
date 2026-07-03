# Modelo de Amenazas - HermesChat

## Invariantes Criptográficas
- Root Key nunca abandona Rust/WASM
- Ninguna clave privada se exporta a JS
- Todo establecimiento de sesión usa HKDF(X25519 || ML-KEM)
- Todo mensaje usa AEAD autenticado
- Todo fallo criptográfico termina en Fail-Closed
- Toda clave temporal implementa ZeroizeOnDrop
- Backend nunca participa en operaciones criptográficas
- Servidor nunca posee secretos suficientes para descifrar

## Protege Contra
- Ataques pasivos (escucha de red)
- Ataques MITM (Double Ratchet + firmas)
- Exfiltración de claves (zeroize + WASM)
- XSS y CSRF (CSP + sanitización)
- Ataques de replay (contadores + skip keys)
- Store-Now-Decrypt-Later (híbrido X25519 + ML-KEM)

## NO Protege Contra
- Compromiso del dispositivo físico
- Ataques de canal lateral en hardware
- Malware en el sistema operativo
- Keyloggers y screen capture
- Ataques a la cadena de suministro

## Supuestos del Modelo
- El navegador es seguro (HTTPS, CSP, WebCrypto)
- El servidor es honesto pero curioso
- Los usuarios protegen sus contraseñas
- WASM cargado sin modificaciones
- Usuario verifica Safety Numbers

## Programa de Divulgación de Vulnerabilidades (VDP)
Agradecemos a la comunidad de investigadores de seguridad su colaboración para mantener HermesChat seguro. Si encuentras un fallo de seguridad, por favor repórtalo siguiendo estas pautas:

* **Canal de Contacto:** Enviar reporte a `security@hermes.chat`.
* **Cifrado (Opcional pero recomendado):** Puedes usar nuestra llave PGP pública (Fingerprint: TBD) para enviar la información de manera segura.
* **Tiempos de Respuesta (SLA):**
  - Acuse de recibo: 48 horas.
  - Evaluación inicial y triage: 5 días hábiles.
  - Resolución / Plan de mitigación: 15-30 días dependiendo de la criticidad.
* **Política de Puerto Seguro (Safe Harbor):** Si realizas tu investigación de buena fe sin afectar a usuarios reales, sin exfiltrar datos y reportando a través de este canal, no iniciaremos acciones legales en tu contra.
* **Reconocimiento:** Los reportes válidos que resulten en parches críticos serán reconocidos públicamente (si el investigador lo desea) en nuestro Salón de la Fama y archivo de Cambios de Seguridad.
* **Período de Embargo:** Solicitamos 90 días de confidencialidad antes de publicar pruebas de concepto (PoC) para darnos tiempo de proteger a la comunidad y desplegar parches en producción.
