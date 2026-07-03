-- ============================================
-- DATABASE HERMÉTICA - CERO DATOS SENSIBLES
-- ============================================
-- 
-- Si confiscan esta DB, SOLO obtienen:
-- - Hashes irreversibles de IDs
-- - Claves públicas (son públicas por definición)
-- - Contadores sin contexto
-- 
-- NO obtienen:
-- - Mensajes (nunca estuvieron aquí)
-- - Contactos (nunca estuvieron aquí)
-- - Grupos (nunca estuvieron aquí)
-- - IPs reales (nunca se almacenaron)
-- - Identidades (hashes no reversibles)

CREATE TABLE IF NOT EXISTS users (
    id_hash VARCHAR(64) PRIMARY KEY,         -- SHA3-256(ID) IRREVERSIBLE
    public_key_mlkem TEXT NOT NULL,          -- Clave pública (información pública)
    public_key_sphincs TEXT NOT NULL,        -- Clave pública (información pública)
    created_at INTEGER NOT NULL,             -- UNIX timestamp redondeado a 5 min
    last_relay_at INTEGER NOT NULL,          -- Último relay (timestamp redondeado)
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS used_key_hashes (
    key_hash VARCHAR(64) PRIMARY KEY,        -- SHA3-256 clave sesión (anti-reuso)
    used_at INTEGER NOT NULL,                -- Timestamp redondeado
    expires_at INTEGER NOT NULL              -- TTL auto-limpieza
);

CREATE TABLE IF NOT EXISTS cloud_backups (
    user_hash VARCHAR(64) NOT NULL,          -- SHA3-256(ID) del propietario
    backup_id VARCHAR(64) PRIMARY KEY,       -- ID único del backup
    encrypted_data TEXT NOT NULL,            -- Datos cifrados E2EE en hex/base64
    backup_type VARCHAR(20) NOT NULL,        -- 'full' o 'incremental'
    parent_id VARCHAR(64),                   -- ID del backup padre si es incremental
    timestamp INTEGER NOT NULL,              -- Fecha de creación
    FOREIGN KEY(user_hash) REFERENCES users(id_hash)
);
