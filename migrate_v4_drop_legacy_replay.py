"""
Script de migración de DB para HermesChat v4.0.

Elimina definitivamente la tabla heredada `used_key_hashes`.
La nueva autoridad Anti-Replay reside en `replay_claims` (manejada por Rust).

NOTA ARQUITECTÓNICA:
Este archivo denota la migración "v4" del framework heredado en Python.
Por otro lado, la tabla `replay_claims` controlada por el crate `hermes_replay_sql` 
tiene su propio versionado interno estricto (actualmente `hermes_schema_version = 1`).
Ambos versionados coexisten pero pertenecen a subsistemas diferentes.
"""
import pymysql
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "hermeschat")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

def migrate():
    conn = None
    try:
        conn = pymysql.connect(host=DB_HOST, user=DB_USER, password=DB_PASSWORD, port=DB_PORT)
        cursor = conn.cursor()
        
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME}")
        cursor.execute(f"USE {DB_NAME}")

        # Comprobar si la tabla existe
        cursor.execute("SHOW TABLES LIKE 'used_key_hashes'")
        exists = cursor.fetchone()

        if exists:
            logger.info("⚠️ Tabla heredada 'used_key_hashes' detectada. Procediendo a erradicarla...")
            cursor.execute("DROP TABLE IF EXISTS used_key_hashes")
            conn.commit()
            logger.info("✅ Tabla 'used_key_hashes' eliminada exitosamente. La migración a replay_claims está completa.")
        else:
            logger.info("✅ La tabla 'used_key_hashes' no existe. Migración ya completada.")

    except Exception as e:
        logger.error(f"❌ Error durante la migración: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    migrate()
