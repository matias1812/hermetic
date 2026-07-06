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
    - NUNCA persiste mensajes, contactos, ni grupos.
    - Registra únicamente hashes irreversibles de usuarios y hashes de sesión.
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
                    is_active BOOLEAN DEFAULT TRUE
                ) ENGINE=InnoDB
            """)
            
            # Tabla de hashes de llaves usadas (anti-reproducibilidad)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS used_key_hashes (
                    key_hash VARCHAR(64) PRIMARY KEY,
                    used_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL
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
                    is_active BOOLEAN DEFAULT TRUE
                )
            """)
            
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS used_key_hashes (
                    key_hash TEXT PRIMARY KEY,
                    used_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL
                )
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
        existing = self.get_user(id_hash)
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            now = int(time.time())
            # Redondear marca de tiempo a 5 minutos (300 segundos) para anonimato
            rounded_time = (now // 300) * 300
            
            if existing:
                if self.is_mysql:
                    cursor.execute("""
                        UPDATE users SET public_key_mlkem = %s, public_key_sphincs = %s WHERE id_hash = %s
                    """, (public_key_mlkem, public_key_sphincs, id_hash))
                else:
                    cursor.execute("""
                        UPDATE users SET public_key_mlkem = ?, public_key_sphincs = ? WHERE id_hash = ?
                    """, (public_key_mlkem, public_key_sphincs, id_hash))
            else:
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

    def is_key_used(self, key_hash: str) -> bool:
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            if self.is_mysql:
                cursor.execute("SELECT 1 FROM used_key_hashes WHERE key_hash = %s", (key_hash,))
            else:
                cursor.execute("SELECT 1 FROM used_key_hashes WHERE key_hash = ?", (key_hash,))
            row = cursor.fetchone()
            cursor.close()
            return row is not None
        except Exception as e:
            logger.error(f"Error checking key hash: {e}")
            raise DatabaseError("Key check operation failed")
        finally:
            conn.close()

    def mark_key_used(self, key_hash: str, expires_at: int):
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            now = int(time.time())
            rounded_time = (now // 300) * 300
            
            if self.is_mysql:
                cursor.execute("""
                    INSERT IGNORE INTO used_key_hashes (key_hash, used_at, expires_at)
                    VALUES (%s, %s, %s)
                """, (key_hash, rounded_time, expires_at))
            else:
                cursor.execute("""
                    INSERT OR IGNORE INTO used_key_hashes (key_hash, used_at, expires_at)
                    VALUES (?, ?, ?)
                """, (key_hash, rounded_time, expires_at))
                
            conn.commit()
            cursor.close()
        except Exception as e:
            logger.error(f"Error marking key hash: {e}")
            raise DatabaseError("Mark key hash operation failed")
        finally:
            conn.close()

    def cleanup_expired_keys(self):
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            now = int(time.time())
            if self.is_mysql:
                cursor.execute("DELETE FROM used_key_hashes WHERE expires_at < %s", (now,))
            else:
                cursor.execute("DELETE FROM used_key_hashes WHERE expires_at < ?", (now,))
            conn.commit()
            cursor.close()
        except Exception as e:
            logger.error(f"Error cleaning up key hashes: {e}")
            raise DatabaseError("Key hash cleanup operation failed")
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

    def count_used_keys(self) -> int:
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM used_key_hashes")
            count = cursor.fetchone()[0]
            cursor.close()
            return count
        except Exception as e:
            logger.error(f"Error counting key hashes: {e}")
            return -1
        finally:
            conn.close()

    def purge_all(self) -> dict:
        """☢️ Nuclear purge — dev/testing only. Deletes all users and key hashes."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            if self.is_mysql:
                cursor.execute("SELECT COUNT(*) FROM users")
                u = cursor.fetchone()[0]
                cursor.execute("SELECT COUNT(*) FROM used_key_hashes")
                k = cursor.fetchone()[0]
                cursor.execute("TRUNCATE TABLE used_key_hashes")
                cursor.execute("TRUNCATE TABLE users")
            else:
                cursor.execute("SELECT COUNT(*) FROM users")
                u = cursor.fetchone()[0]
                cursor.execute("SELECT COUNT(*) FROM used_key_hashes")
                k = cursor.fetchone()[0]
                cursor.execute("DELETE FROM used_key_hashes")
                cursor.execute("DELETE FROM users")
            conn.commit()
            cursor.close()
            logger.warning(f"☢️ Nuclear purge executed: {u} users, {k} key hashes deleted.")
            return {"users": u, "key_hashes": k}
        except Exception as e:
            logger.error(f"Error during purge: {e}")
            raise DatabaseError(f"Purge operation failed: {e}")
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

db = DatabaseConnection()
