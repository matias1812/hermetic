# 🚨 PLAN DE RECUPERACIÓN DE DESASTRES (DISASTER RECOVERY)

Este documento describe los procedimientos operativos estándar (SOPs) para restaurar las operaciones normales de HermesChat tras un incidente crítico.

---

## 1. Caída del Servidor (Relay Offline)

**Escenario:** El servidor backend (FastAPI/WebSocket) se detiene abruptamente o es inaccesible.
**Impacto:** Los clientes no pueden registrarse ni enviar mensajes en tiempo real. Los mensajes cifrados en tránsito se pierden si no estaban confirmados.

**Procedimiento de Recuperación:**
1. Reiniciar el servicio desde el orquestador (Docker/Systemd).
2. Si el servidor fue comprometido, provisionar una nueva instancia en infraestructura limpia.
3. Actualizar los registros DNS (si es necesario) con un TTL bajo.
4. **Resiliencia Cliente-Lado:** Los clientes de HermesChat en el navegador detectarán la desconexión e intentarán reconectar exponencialmente (`ReconnectingWebSocket`). Una vez levantado el servidor, las sesiones locales conservan el estado de trinquete y reanudan el tráfico sin pérdida criptográfica.

## 2. Pérdida o Corrupción de la Base de Datos (MySQL)

**Escenario:** La tabla `users` o `used_key_hashes` se corrompe o se pierde sin un backup reciente.
**Impacto:** Los usuarios no podrán iniciar sesión (error 401/404 al verificar su identidad).

**Procedimiento de Recuperación:**
1. Dado que HermesChat sigue el principio de **Minimización de Datos**, la pérdida de la BD central *no implica pérdida de historiales de chat* (están en los clientes locales).
2. Truncar las tablas para forzar un estado limpio:
   ```sql
   TRUNCATE TABLE users;
   TRUNCATE TABLE used_key_hashes;
   ```
3. Activar el protocolo de "Re-registro transparente": 
   * Los clientes frontend detectarán el error 401 en sus peticiones `/api/fetch` o durante el heartbeat.
   * El `SyncManager` está diseñado para re-registrar automáticamente la identidad (hashes) y republicar los PreKey Bundles cuando detecta una base de datos limpia.

## 3. Compromiso Confirmado del Servidor

**Escenario:** Un atacante obtuvo acceso Root al servidor en la nube.
**Impacto:** El atacante puede denegar el servicio, inyectar mensajes basura o intentar leer la memoria en vivo.

**Procedimiento de Recuperación:**
1. Apagar y aislar el servidor infectado inmediatamente (preservar estado para análisis forense).
2. Revocar credenciales de AWS/GCP, tokens de base de datos y llaves SSH.
3. Desplegar una nueva instancia partiendo de una AMI limpia y el último commit auditado en `main`.
4. **Evaluación de Daños:** Gracias a la arquitectura Zero-Knowledge y PFS/PCS, los mensajes de los usuarios *no* fueron descifrados. Notificar a los usuarios mediante canales OOB (Out-of-Band) si existió disrupción, pero garantizar que la confidencialidad se mantuvo intacta.

## 4. Rotación y Expiración de Certificados TLS

**Escenario:** El certificado TLS/SSL del servidor caduca o su clave privada se compromete.
**Impacto:** El cliente rechazará la conexión HTTPS/WSS (fail-closed de navegadores), denegando el servicio.

**Procedimiento de Recuperación:**
1. Solicitar un nuevo certificado vía Let's Encrypt o CA interna.
2. Actualizar configuración en el proxy inverso (Nginx).
3. Recargar el servicio Nginx sin downtime (`nginx -s reload`).

## 5. Restauración Local de Usuario (Pérdida del Dispositivo)

**Escenario:** Un usuario final pierde su portátil o borra su navegador.
**Impacto:** Pérdida de todas las llaves de sesión, contactos e identidad local.

**Procedimiento de Recuperación (User-Side):**
1. El usuario debe importar su archivo `.hermes` (copia de seguridad cifrada) al entrar al sitio.
2. Ingresar la contraseña maestra (Argon2id KDF).
3. El `BackupManager` reconstruirá el estado en IndexedDB, restaurando la bóveda y permitiendo reconectar con sus contactos.
4. *Nota:* Sin el archivo `.hermes` o la contraseña correcta, los datos son irrecuperables matemáticamente. No hay mecanismos de "Olvidé mi contraseña".
