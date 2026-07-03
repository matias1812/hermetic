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

## Política de Divulgación
- Reportar a security@hermes.chat
- Cifrar con PGP key (fingerprint: TBD)
- Tiempo de respuesta: 48 horas
- Período de embargo: 90 días
