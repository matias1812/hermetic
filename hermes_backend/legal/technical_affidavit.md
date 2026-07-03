# 📜 DECLARACIÓN TÉCNICA JURADA

## Arquitectura Zero-Knowledge de HermesChat

El abajo firmante, en calidad de administrador técnico del servidor
HermesChat, DECLARA BAJO JURAMENTO:

### 1. Cifrado Extremo-a-Extremo

Los mensajes se cifran en el dispositivo del emisor usando:
- X25519 y ML-KEM-768 (FIPS 203) para intercambio híbrido de claves
- AES-256-GCM / XChaCha20 para cifrado simétrico
- Ed25519 para firmas digitales

Las claves privadas existen EXCLUSIVAMENTE en los dispositivos
de los usuarios. El servidor NUNCA posee acceso a ellas.

### 2. Servidor Relay Ciego

El servidor retransmite blobs cifrados sin capacidad de:
- Descifrar el contenido
- Identificar a los participantes
- Determinar el tipo de contenido (texto, imagen, etc.)

### 3. Anonimización de IPs

Las direcciones IP son anonimizadas antes de cualquier procesamiento:
- IPv4: último octeto = 0
- IPv6: últimos 64 bits = 0

No se almacenan IPs reales en ningún momento.

### 4. Ausencia de Persistencia

Los blobs cifrados existen SOLO en RAM durante un máximo de 5 minutos.
No se realizan backups del servidor.
No existen logs de acceso.
No se almacenan metadatos de comunicación.

### 5. Imposibilidad Técnica de Entrega

Por la arquitectura descrita, es TÉCNICAMENTE IMPOSIBLE que el
administrador del servidor entregue:
- Contenido de mensajes
- Identidades de usuarios
- Historial de comunicaciones
- Relaciones entre usuarios

Firmado: [NOMBRE]
Cargo: Administrador Técnico
Fecha: [FECHA]
