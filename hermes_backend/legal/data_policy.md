# 📜 POLÍTICA DE DATOS - HERMESCHAT v7.0

## Principio Fundamental

HermesChat está diseñado bajo el principio de **"Zero-Knowledge Server"**:
el servidor no puede acceder a los datos de los usuarios aunque quiera.

## Datos que el servidor NO posee

| Tipo de dato | ¿Existe en el servidor? | Razón técnica |
|-------------|------------------------|---------------|
| Mensajes | ❌ No | Cifrados E2E. Servidor no tiene claves. |
| Contactos | ❌ No | Almacenados solo en dispositivo del usuario. |
| Grupos | ❌ No | Gestionados en cliente. |
| Historial | ❌ No | Solo existe en backup cifrado del usuario. |
| IPs reales | ❌ No | Anonimizadas (último octeto = 0). |
| Metadatos | ❌ No | Servidor es relay ciego. |
| Identidades | ❌ No | Solo hashes SHA3-256 irreversibles. |

## Datos que el servidor SÍ posee

| Tipo de dato | Utilidad para terceros |
|-------------|------------------------|
| Hashes de IDs | Irreversibles sin conocer ID original |
| Claves públicas | Son públicas por definición |
| Contador de relay | Número sin contexto |
| Timestamps redondeados | Precisión 5 minutos |

## Respuesta a órdenes judiciales

Si una autoridad solicita datos, el administrador SOLO puede entregar:
- Lista de hashes (irreversibles)
- Claves públicas (información pública)
- Contador de mensajes relayados (sin contenido ni participantes)

Es TÉCNICAMENTE IMPOSIBLE entregar:
- Contenido de mensajes
- Identidades reales
- Historial de conversaciones
- Lista de contactos
- IPs de usuarios

## Backup del usuario

El usuario es RESPONSABLE de su backup cifrado.
El servidor NO tiene acceso a los backups.
Sin la contraseña del usuario, los backups son bytes aleatorios.
