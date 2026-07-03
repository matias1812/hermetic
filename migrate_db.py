"""
Script de migración de DB para HermesChat v3.0.

Descarta la tabla users con esquema viejo y la recrea con el esquema correcto.
Ejecutar UNA VEZ cuando la tabla existente tiene columnas incorrectas.
"""
import pymysql
import os

DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "hermeschat")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

def migrate():
    conn = pymysql.connect(host=DB_HOST, user=DB_USER, password=DB_PASSWORD, port=DB_PORT)
    cursor = conn.cursor()
    cursor.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME}")
    cursor.execute(f"USE {DB_NAME}")

    # Detectar esquema actual de users
    cursor.execute("SHOW TABLES LIKE 'users'")
    exists = cursor.fetchone()

    if exists:
        cursor.execute("DESCRIBE users")
        cols = {row[0] for row in cursor.fetchall()}
        print(f"Columnas actuales en 'users': {cols}")

        if 'id_usuario' not in cols:
            print("⚠️  Columna 'id_usuario' no encontrada. Reconstruyendo tabla...")
            cursor.execute("DROP TABLE users")
            print("✅ Tabla 'users' eliminada.")
        else:
            print("✅ Esquema de 'users' ya es correcto. No se requiere migración.")
            cursor.close()
            conn.close()
            return

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id_usuario VARCHAR(36) PRIMARY KEY,
            alias VARCHAR(50) NOT NULL,
            public_key_mlkem TEXT NOT NULL,
            public_key_sphincs TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_active BOOLEAN DEFAULT TRUE,
            INDEX idx_alias (alias),
            INDEX idx_last_seen (last_seen)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    print("✅ Tabla 'users' creada con esquema correcto.")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS used_otp_keys (
            key_hash VARCHAR(64) PRIMARY KEY,
            used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            INDEX idx_expires (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    print("✅ Tabla 'used_otp_keys' verificada/creada.")

    conn.commit()
    cursor.close()
    conn.close()
    print("\n🎉 Migración completada. La base de datos está lista.")

if __name__ == "__main__":
    migrate()
