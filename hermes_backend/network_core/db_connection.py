import os
import pymysql
import sqlite3
import logging
import time
from typing import Optional, Dict

logger = logging.getLogger(__name__)

class DatabaseError(Exception):
    """Excepción para errores de base de datos (fail-closed)."""
    pass

class DatabaseConnection:
    """
    Conexión de base de datos hermética y mínima.

    POLÍTICA:
    - NUNCA persiste contenido de mensajes, ni datos de contactos/grupos (nombre,
      claves, historial). Eso vive solo cifrado en el dispositivo del usuario.
    - Registra únicamente hashes irreversibles de usuarios y hashes de sesión.
    - user_relationships (2026-08-27, ver BACKLOG.md #1) es la única excepción
      deliberada: un par (user_hash, target_id) opaco, para poder ofrecer
      reconciliación si el usuario pierde su estado local. El cliente decide
      explícitamente qué registrar (solo tras completar un handshake real, nunca
      inferido de tráfico de relay) — es la MISMA relación que el servidor ya ve
      transitoriamente en cada envelope relayado, solo que ahora persistida a
      pedido explícito del cliente, no derivada unilateralmente por el servidor.
    - Fail-closed: errores → excepción.
    """

    def __init__(self):
        self.db_host = os.getenv("DB_HOST", "127.0.0.1")
        self.db_user = os.getenv("DB_USER", "root")
        self.db_password = os.getenv("DB_PASSWORD", "")
        self.db_name = os.getenv("DB_NAME", "hermeschat")
        self.db_port = int(os.getenv("DB_PORT", "3306"))
        
        self.sqlite_path = "hermes_fallback.db"
        self.is_mysql = False
        self._init_db()

    def _init_db(self):
        try:
            # Intentar conectar a MySQL
            conn = pymysql.connect(
                host=self.db_host,
                user=self.db_user,
                password=self.db_password,
                port=self.db_port
            )
            cursor = conn.cursor()
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS {self.db_name}")
            cursor.execute(f"USE {self.db_name}")
            
            # Tabla de usuarios
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id_hash VARCHAR(64) PRIMARY KEY,
                    public_key_mlkem TEXT NOT NULL,
                    public_key_sphincs TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    last_relay_at INTEGER NOT NULL,
                    is_active BOOLEAN DEFAULT TRUE,
                    recovery_proof_hex VARCHAR(64) NULL
                ) ENGINE=InnoDB
            """)

            # Tabla de backups cifrados en la nube (save_cloud_backup/get_cloud_backups).
            # Faltaba — /api/backup fallaba con 500 en cualquier entorno recién provisionado.
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS cloud_backups (
                    id INTEGER PRIMARY KEY AUTO_INCREMENT,
                    user_hash VARCHAR(64) NOT NULL,
                    backup_id VARCHAR(128) NOT NULL,
                    encrypted_data LONGTEXT NOT NULL,
                    backup_type VARCHAR(32) NOT NULL,
                    parent_id VARCHAR(128) NULL,
                    timestamp INTEGER NOT NULL,
                    INDEX idx_cloud_backups_user_hash (user_hash)
                ) ENGINE=InnoDB
            """)

            # Relaciones opacas para reconciliación (ver docstring de la clase y BACKLOG.md #1).
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_relationships (
                    id INTEGER PRIMARY KEY AUTO_INCREMENT,
                    user_hash VARCHAR(64) NOT NULL,
                    relationship_type VARCHAR(16) NOT NULL,
                    target_id VARCHAR(128) NOT NULL,
                    created_at INTEGER NOT NULL,
                    UNIQUE KEY uniq_relationship (user_hash, relationship_type, target_id),
                    INDEX idx_user_relationships_user_hash (user_hash)
                ) ENGINE=InnoDB
            """)

            conn.commit()
            cursor.close()
            conn.close()

            self.is_mysql = True
            logger.info("Successfully connected to MySQL database.")
            print("  -> MySQL database connection established.")
        except Exception as e:
            logger.warning(f"MySQL connection failed: {e}. Falling back to SQLite.")
            print(f"  -> MySQL offline ({e}). Falling back to local SQLite.")
            self._init_sqlite()

    def _init_sqlite(self):
        try:
            conn = sqlite3.connect(self.sqlite_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id_hash TEXT PRIMARY KEY,
                    public_key_mlkem TEXT NOT NULL,
                    public_key_sphincs TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    last_relay_at INTEGER NOT NULL,
                    is_active BOOLEAN DEFAULT TRUE,
                    recovery_proof_hex TEXT NULL
                )
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS cloud_backups (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_hash TEXT NOT NULL,
                    backup_id TEXT NOT NULL,
                    encrypted_data TEXT NOT NULL,
                    backup_type TEXT NOT NULL,
                    parent_id TEXT,
                    timestamp INTEGER NOT NULL
                )
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_cloud_backups_user_hash ON cloud_backups (user_hash)
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_relationships (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_hash TEXT NOT NULL,
                    relationship_type TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    UNIQUE(user_hash, relationship_type, target_id)
                )
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_user_relationships_user_hash ON user_relationships (user_hash)
            """)

            conn.commit()
            cursor.close()
            conn.close()
            logger.info("Successfully connected to SQLite database.")
        except Exception as e:
            logger.error(f"SQLite initialization failed: {e}")
            raise DatabaseError("Database initialization failed (fail-closed)")

    def _get_connection(self):
        try:
            if self.is_mysql:
                return pymysql.connect(
                    host=self.db_host,
                    user=self.db_user,
                    password=self.db_password,
                    database=self.db_name,
                    port=self.db_port
                )
            else:
                return sqlite3.connect(self.sqlite_path)
        except Exception as e:
            logger.error(f"Database connection error: {e}")
            raise DatabaseError("Database connection failed")

    def register_user(self, id_hash: str, public_key_mlkem: str, public_key_sphincs: str):
        # Nota arquitectónica: public_key_sphincs almacena Ed25519 PK (32B) para clientes web WASM
        # y SPHINCS+ PK (32B) para clientes nativos post-cuánticos.
        #
        # SEC: registro de una sola escritura -- NUNCA sobreescribir un id_hash ya registrado.
        # No hay contraseña del lado servidor (la autenticación real es por posesión de la
        # clave privada vía firma), así que un UPDATE sin chequeo de propiedad le dejaba a
        # cualquiera que supiera el alias público de otra persona (alias -> id_hash es un
        # hash público, no un secreto) reemplazar sus claves registradas sin ninguna prueba de
        # posesión: toma de cuenta completa (la víctima real queda con firma inválida, 401 en
        # cualquier login futuro) y habilita MITM contra cualquiera que inicie un contacto
        # nuevo después del ataque (encriptarían contra la clave del atacante). El endpoint
        # (api.py::register_keys) YA esperaba este 409 en su manejo de excepciones, y
        # sync_manager.js YA lo maneja explícitamente en dos lugares (fetchPendingBlobs
        # detiene la sincronización y avisa al usuario) -- este método nunca lo lanzaba, así
        # que ese camino jamás se ejecutaba. Quien pierde sus llaves locales de verdad se
        # recupera con su frase BIP-39 real, no re-registrando en silencio.
        existing = self.get_user(id_hash)
        if existing:
            raise DatabaseError("User already registered")
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            now = int(time.time())
            # Redondear marca de tiempo a 5 minutos (300 segundos) para anonimato
            rounded_time = (now // 300) * 300

            if self.is_mysql:
                cursor.execute("""
                    INSERT INTO users (id_hash, public_key_mlkem, public_key_sphincs, created_at, last_relay_at, is_active)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (id_hash, public_key_mlkem, public_key_sphincs, rounded_time, rounded_time, True))
            else:
                cursor.execute("""
                    INSERT INTO users (id_hash, public_key_mlkem, public_key_sphincs, created_at, last_relay_at, is_active)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (id_hash, public_key_mlkem, public_key_sphincs, rounded_time, rounded_time, True))

            conn.commit()
            cursor.close()
        except DatabaseError:
            raise
        except (pymysql.err.IntegrityError, sqlite3.IntegrityError):
            # Carrera: dos registros concurrentes del mismo id_hash nuevo pasaron ambos
            # el chequeo `existing` de arriba antes de que cualquiera insertara; la PK
            # rechaza al segundo. Mismo resultado (409), no un 503 de error de DB real.
            raise DatabaseError("User already registered")
        except Exception as e:
            logger.error(f"Error registering user: {e}")
            raise DatabaseError("Register user operation failed")
        finally:
            conn.close()

    def get_user(self, id_hash: str) -> Optional[dict]:
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            if self.is_mysql:
                cursor.execute("SELECT id_hash, public_key_mlkem, public_key_sphincs, is_active FROM users WHERE id_hash = %s", (id_hash,))
            else:
                cursor.execute("SELECT id_hash, public_key_mlkem, public_key_sphincs, is_active FROM users WHERE id_hash = ?", (id_hash,))
            
            row = cursor.fetchone()
            cursor.close()
            if row:
                return {
                    'id_hash': row[0],
                    'public_key_mlkem': row[1],
                    'public_key_sphincs': row[2],
                    'is_active': bool(row[3])
                }
            return None
        except Exception as e:
            logger.error(f"Error querying user: {e}")
            raise DatabaseError("Query user operation failed")
        finally:
            conn.close()

    def set_recovery_proof(self, id_hash: str, proof_hex: str) -> bool:
        """
        Guarda el "proof" de recuperación (derivado de la frase mnemónica vía
        HKDF con info distinto al de la clave de cifrado del backup — ver
        core_api.rs derive_recovery_proof). El servidor solo puede comparar
        este valor byte a byte; no puede derivar la frase ni la clave de
        cifrado del backup a partir de él.
        """
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            if self.is_mysql:
                cursor.execute("UPDATE users SET recovery_proof_hex = %s WHERE id_hash = %s", (proof_hex, id_hash))
            else:
                cursor.execute("UPDATE users SET recovery_proof_hex = ? WHERE id_hash = ?", (proof_hex, id_hash))
            conn.commit()
            updated = cursor.rowcount > 0
            cursor.close()
            return updated
        except Exception as e:
            logger.error(f"Error setting recovery proof: {e}")
            raise DatabaseError("Set recovery proof operation failed")
        finally:
            conn.close()

    def get_recovery_proof(self, id_hash: str) -> Optional[str]:
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            if self.is_mysql:
                cursor.execute("SELECT recovery_proof_hex FROM users WHERE id_hash = %s", (id_hash,))
            else:
                cursor.execute("SELECT recovery_proof_hex FROM users WHERE id_hash = ?", (id_hash,))
            row = cursor.fetchone()
            cursor.close()
            return row[0] if row else None
        except Exception as e:
            logger.error(f"Error querying recovery proof: {e}")
            raise DatabaseError("Query recovery proof operation failed")
        finally:
            conn.close()

    def count_users(self) -> int:
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM users")
            count = cursor.fetchone()[0]
            cursor.close()
            return count
        except Exception as e:
            logger.error(f"Error counting users: {e}")
            return -1
        finally:
            conn.close()

    def count_consumed_replay_claims(self) -> int:
        """
        [ACOPLEMENTO DELIBERADO]: Esta función lee directamente de la tabla `replay_claims` 
        gestionada por el crate `hermes_replay_sql` de Rust. Se realiza de forma excepcional 
        para alimentar las estadísticas operativas del panel de administración, y asume el esquema interno 
        (ej. la existencia de la columna `state` = 'consumed').
        """
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            if self.is_mysql:
                cursor.execute("SELECT COUNT(*) FROM replay_claims WHERE state = 'consumed'")
                count = cursor.fetchone()[0]
                cursor.close()
                return count
            else:
                return 0
        except Exception as e:
            logger.error(f"Error counting consumed replay claims: {e}")
            return -1
        finally:
            conn.close()

    def purge_all(self) -> dict:
        """☢️ Nuclear purge — dev/testing only. Deletes all users and replay_claims."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            if self.is_mysql:
                cursor.execute("SELECT COUNT(*) FROM users")
                u = cursor.fetchone()[0]
                # replay_claims solo existe si se aplicó el schema de hermes_replay_sql
                # (Rust/hermes_ffi). En un entorno donde ese pipeline nunca se conectó
                # (p.ej. desarrollo sin hermes_ffi compilado) la tabla no existe todavía —
                # eso no es un error, no hay nada que purgar ahí.
                cursor.execute("SHOW TABLES LIKE 'replay_claims'")
                if cursor.fetchone():
                    cursor.execute("SELECT COUNT(*) FROM replay_claims")
                    k = cursor.fetchone()[0]
                    cursor.execute("TRUNCATE TABLE replay_claims")
                else:
                    k = 0
                cursor.execute("TRUNCATE TABLE users")
            else:
                cursor.execute("SELECT COUNT(*) FROM users")
                u = cursor.fetchone()[0]
                k = 0
                cursor.execute("DELETE FROM users")
            conn.commit()
            cursor.close()
            return {"users_purged": u, "replay_claims_purged": k}
        except Exception as e:
            logger.error(f"Error purging database: {e}")
            raise DatabaseError("Purge operation failed")
        finally:
            conn.close()

    def save_cloud_backup(self, user_hash: str, backup_id: str, encrypted_data: str, backup_type: str, parent_id: str = None) -> bool:
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            ts = int(time.time())
            if self.is_mysql:
                cursor.execute("""
                    INSERT INTO cloud_backups (user_hash, backup_id, encrypted_data, backup_type, parent_id, timestamp)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (user_hash, backup_id, encrypted_data, backup_type, parent_id, ts))
            else:
                cursor.execute("""
                    INSERT INTO cloud_backups (user_hash, backup_id, encrypted_data, backup_type, parent_id, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (user_hash, backup_id, encrypted_data, backup_type, parent_id, ts))
            conn.commit()
            cursor.close()
            return True
        except Exception as e:
            logger.error(f"Error saving cloud backup: {e}")
            return False
        finally:
            conn.close()

    def get_cloud_backups(self, user_hash: str) -> list:
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            if self.is_mysql:
                cursor.execute("""
                    SELECT backup_id, encrypted_data, backup_type, parent_id, timestamp 
                    FROM cloud_backups 
                    WHERE user_hash = %s 
                    ORDER BY timestamp ASC
                """, (user_hash,))
            else:
                cursor.execute("""
                    SELECT backup_id, encrypted_data, backup_type, parent_id, timestamp 
                    FROM cloud_backups 
                    WHERE user_hash = ? 
                    ORDER BY timestamp ASC
                """, (user_hash,))
            rows = cursor.fetchall()
            cursor.close()
            backups = []
            for row in rows:
                backups.append({
                    "backup_id": row[0],
                    "encrypted_data": row[1],
                    "backup_type": row[2],
                    "parent_id": row[3],
                    "timestamp": row[4]
                })
            return backups
        except Exception as e:
            logger.error(f"Error getting cloud backups: {e}")
            return []
        finally:
            conn.close()

    VALID_RELATIONSHIP_TYPES = ("contact", "group")

    def add_relationship(self, user_hash: str, relationship_type: str, target_id: str) -> bool:
        """Registra que user_hash tiene relationship_type ('contact'/'group') con
        target_id. Idempotente — ya existente no es error."""
        if relationship_type not in self.VALID_RELATIONSHIP_TYPES:
            raise ValueError(f"relationship_type inválido: {relationship_type}")
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            now = int(time.time())
            if self.is_mysql:
                cursor.execute("""
                    INSERT INTO user_relationships (user_hash, relationship_type, target_id, created_at)
                    VALUES (%s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE created_at = created_at
                """, (user_hash, relationship_type, target_id, now))
            else:
                cursor.execute("""
                    INSERT OR IGNORE INTO user_relationships (user_hash, relationship_type, target_id, created_at)
                    VALUES (?, ?, ?, ?)
                """, (user_hash, relationship_type, target_id, now))
            conn.commit()
            cursor.close()
            return True
        except Exception as e:
            logger.error(f"Error adding relationship: {e}")
            return False
        finally:
            conn.close()

    def remove_relationship(self, user_hash: str, relationship_type: str, target_id: str) -> bool:
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            if self.is_mysql:
                cursor.execute("""
                    DELETE FROM user_relationships
                    WHERE user_hash = %s AND relationship_type = %s AND target_id = %s
                """, (user_hash, relationship_type, target_id))
            else:
                cursor.execute("""
                    DELETE FROM user_relationships
                    WHERE user_hash = ? AND relationship_type = ? AND target_id = ?
                """, (user_hash, relationship_type, target_id))
            conn.commit()
            cursor.close()
            return True
        except Exception as e:
            logger.error(f"Error removing relationship: {e}")
            return False
        finally:
            conn.close()

    def get_relationships(self, user_hash: str) -> dict:
        """Devuelve {'contacts': [target_id, ...], 'groups': [target_id, ...]}."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            if self.is_mysql:
                cursor.execute("""
                    SELECT relationship_type, target_id FROM user_relationships WHERE user_hash = %s
                """, (user_hash,))
            else:
                cursor.execute("""
                    SELECT relationship_type, target_id FROM user_relationships WHERE user_hash = ?
                """, (user_hash,))
            rows = cursor.fetchall()
            cursor.close()
            result = {"contacts": [], "groups": []}
            for rel_type, target_id in rows:
                key = "contacts" if rel_type == "contact" else "groups"
                result[key].append(target_id)
            return result
        except Exception as e:
            logger.error(f"Error getting relationships: {e}")
            return {"contacts": [], "groups": []}
        finally:
            conn.close()

    def purge_relationships(self, user_hash: str) -> int:
        """Borra TODAS las relaciones de user_hash (TRUNCATE-por-usuario, no DROP).
        Devuelve cuántas se borraron."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            if self.is_mysql:
                cursor.execute("SELECT COUNT(*) FROM user_relationships WHERE user_hash = %s", (user_hash,))
                count = cursor.fetchone()[0]
                cursor.execute("DELETE FROM user_relationships WHERE user_hash = %s", (user_hash,))
            else:
                cursor.execute("SELECT COUNT(*) FROM user_relationships WHERE user_hash = ?", (user_hash,))
                count = cursor.fetchone()[0]
                cursor.execute("DELETE FROM user_relationships WHERE user_hash = ?", (user_hash,))
            conn.commit()
            cursor.close()
            return count
        except Exception as e:
            logger.error(f"Error purging relationships: {e}")
            raise DatabaseError("Purge relationships operation failed")
        finally:
            conn.close()

db = DatabaseConnection()
