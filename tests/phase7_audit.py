import os
import sys
import time
import requests
import sqlite3
import threading
import subprocess

if sys.platform == 'win32' and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

class Phase7Auditor:
    def __init__(self):
        self.base_url = "http://127.0.0.1:8000"
        self.db_path = os.path.join(os.getcwd(), "hermes_fallback.db")
        self.score = 0
        self.max_score = 0
        self.server_process = None

    def log_success(self, msg):
        print(f"  ✅ {msg}")
        self.score += 1
        self.max_score += 1

    def log_failure(self, msg):
        print(f"  ❌ FALLO: {msg}")
        self.max_score += 1

    def run_level1_static_audit(self):
        print("\n" + "="*50)
        print("🛡️ NIVEL 1: AUDITORÍA ESTÁTICA (Static Code Analysis)")
        print("="*50)

        # Check endpoints that shouldn't exist
        api_py = os.path.join(os.getcwd(), "hermes_backend", "network_core", "api.py")
        if os.path.exists(api_py):
            api_content = open(api_py, "r", encoding="utf-8").read()
            
            if "TotalPrivacyMiddleware" in api_content and "app.add_middleware" in api_content:
                self.log_success("TotalPrivacyMiddleware está activo y enruta request.state.blind_ip.")
            else:
                self.log_failure("TotalPrivacyMiddleware ausente o mal configurado.")
                
            if "/api/debug/purge" not in api_content:
                self.log_success("Endpoint nuclear /api/debug/purge correctamente eliminado.")
            else:
                self.log_failure("El endpoint /api/debug/purge sigue expuesto.")
                
            if "/api/encrypt" not in api_content:
                self.log_success("Criptografía apátrida HTTP (/api/encrypt) correctamente eliminada.")
            else:
                self.log_failure("Endpoints HTTP apátridas siguen expuestos.")
        else:
            self.log_failure("api.py no encontrado.")

        # Check DB connection parameterized queries
        db_conn = os.path.join(os.getcwd(), "hermes_backend", "network_core", "db_connection.py")
        if os.path.exists(db_conn):
            db_content = open(db_conn, "r", encoding="utf-8").read()
            lines = db_content.split('\n')
            
            insecure_sql = False
            for i, line in enumerate(lines):
                if "execute(" in line:
                    if "f\"" in line or "f'" in line or ".format(" in line or ("%" in line and "%s" not in line and "% (" not in line):
                        # CREATE TABLE y USE database usualmente usan interpolación por ser DDL
                        if "CREATE DATABASE" not in line and "USE" not in line and "CREATE TABLE" not in line and "CREATE INDEX" not in line:
                            insecure_sql = True
                            print(f"  ❌ Advertencia: Interpolación SQL sospechosa en db_connection.py L{i+1}: {line.strip()}")
            
            if not insecure_sql:
                self.log_success("Prevención SQLi: Ninguna sentencia DML usa interpolación de cadenas insegura.")
            else:
                self.log_failure("Advertencia: Posible interpolación SQL no parametrizada encontrada.")

    def run_level2_live_audit(self):
        print("\n" + "="*50)
        print("🛡️ NIVEL 2: AUDITORÍA EN VIVO (Live Backend & SQLite Inspection)")
        print("="*50)
        
        # Test connection
        server_live = False
        for _ in range(5):
            try:
                r = requests.get(f"{self.base_url}/docs", timeout=2)
                if r.status_code == 200:
                    server_live = True
                    break
            except requests.ConnectionError:
                time.sleep(1)
        
        if not server_live:
            print("⚠️ El backend no está corriendo en localhost:8000. Los tests HTTP se omitirán.")
            self.log_failure("No se pudo conectar al servidor Live.")
        else:
            self.log_success("Servidor E2EE Backend detectado vivo y respondiendo.")
            
            # API Hardening Test
            r_purge = requests.post(f"{self.base_url}/api/debug/purge")
            if r_purge.status_code in (404, 405):
                self.log_success(f"API Hardening: Endpoint /api/debug/purge inalcanzable (Status: {r_purge.status_code}).")
            else:
                self.log_failure(f"API Hardening Falló: /api/debug/purge devolvió status {r_purge.status_code}.")

            # CORS Test
            r = requests.options(f"{self.base_url}/api/verify", headers={"Origin": "http://localhost:8000", "Access-Control-Request-Method": "POST"})
            if r.headers.get("access-control-allow-origin") == "*":
                self.log_failure("CORS permite cualquier origen (*).")
            else:
                self.log_success(f"CORS estrictamente configurado (Origen actual o nulo).")
                
            # Rate Limit Test
            print("  ⏳ Probando Rate Limiting (enviando peticiones rápidas)...")
            hit_429 = False
            for _ in range(150):
                r = requests.post(f"{self.base_url}/api/verify")
                if r.status_code == 429:
                    hit_429 = True
                    break
            if hit_429:
                self.log_success("Rate Limiting operativo (bloquea escaneos rápidos).")
            else:
                self.log_failure("Rate Limiting NO operativo o límite muy alto.")
        
        # Physical SQLite Inspection
        print("\n  🔍 Inspeccionando físicamente la base de datos de disco (Zero-Knowledge Check)...")
        if not os.path.exists(self.db_path):
            self.log_success(f"La BD de SQLite {self.db_path} no existe (Aún no se ha inicializado o el servidor corre solo RAM).")
        else:
            try:
                conn = sqlite3.connect(self.db_path)
                cursor = conn.cursor()
                
                # Check forbidden tables
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
                tables = [r[0] for r in cursor.fetchall()]
                
                forbidden = ['messages', 'contacts', 'groups', 'message_logs', 'user_metadata', 'chat_history']
                found_forbidden = [t for t in forbidden if t in tables]
                
                # Check for sensitive columns. FALSO POSITIVO encontrado y arreglado acá:
                # la versión anterior hacía `keyword in schema_lower` contra el DDL crudo
                # completo (incluye tipos SQL, no solo nombres de columna) -- eso hace
                # match de 'text' contra el tipo de columna "TEXT" de CUALQUIER columna
                # (p.ej. "public_key_mlkem TEXT NOT NULL"), y de 'ip' como substring
                # dentro de nombres legítimos que no tienen nada que ver, como
                # "relationship_type" (termina en "...ship", que contiene "ip"). Confirmado
                # reproduciendo: `pytest tests/phase7_audit.py` fallaba 9/10 contra un
                # esquema que la propia auditoría de anonimato del proyecto confirma limpio
                # (sin columnas de IP/metadata reales). Fix: comparar por TOKEN de nombre de
                # columna real (vía PRAGMA table_info, no el string de CREATE TABLE), no por
                # substring del DDL — así "TEXT" (tipo) y "relationship"/"ship" (substring
                # casual) dejan de disparar falsos positivos, pero un campo real llamado
                # p.ej. "user_agent" o "ip_address" sigue detectándose.
                sensitive_keywords = ['plaintext', 'message', 'body', 'text', 'content', 'metadata', 'ip', 'user_agent']
                sensitive_keyword_tokens = [kw.split('_') for kw in sensitive_keywords]
                found_sensitive = []
                for table in tables:
                    cursor.execute(f"PRAGMA table_info({table})")
                    for col_row in cursor.fetchall():
                        col_name = col_row[1]
                        col_tokens = col_name.lower().split('_')
                        for keyword, kw_tokens in zip(sensitive_keywords, sensitive_keyword_tokens):
                            n = len(kw_tokens)
                            if any(col_tokens[i:i + n] == kw_tokens for i in range(len(col_tokens) - n + 1)):
                                found_sensitive.append(f"{keyword} in {table}.{col_name}")

                if not found_forbidden and not found_sensitive:
                    self.log_success("Cero Metadatos: Ninguna tabla relacional ni columna sensible existe en el DDL de disco.")
                else:
                    self.log_failure(f"Vulnerabilidad en esquema. Tablas prohibidas: {found_forbidden}. Columnas sensibles: {found_sensitive}")
                
                # Check users table schema
                if 'users' in tables:
                    cursor.execute("PRAGMA table_info(users)")
                    columns = [r[1] for r in cursor.fetchall()]
                    if 'public_key_mlkem' in columns and 'private_key' not in columns:
                        self.log_success("Esquema de Usuarios Zero-Knowledge: Solo almacena IDs y Llaves Públicas (Sin secretos).")
                    else:
                        self.log_failure("El esquema de usuarios almacena campos sospechosos o secretos.")
                
                conn.close()
            except Exception as e:
                self.log_failure(f"Error al inspeccionar SQLite: {e}")

    def generate_report(self):
        print("\n" + "="*50)
        print(f"📊 DICTAMEN DE AUDITORÍA: {self.score}/{self.max_score} Aprobados")
        print("="*50)
        if self.score == self.max_score:
            print("🚀 STATUS: APTO PARA PRODUCCIÓN (HARDENED)")
            print("El backend cumple íntegramente con el modelo Zero-Knowledge.")
        else:
            print("⚠️ STATUS: REQUIERE REMEDIACIÓN")

def test_phase7_audit():
    # Sin esta función, pytest no colecciona nada de este archivo: toda la lógica de
    # Phase7Auditor vive detrás de `if __name__ == "__main__"`, que nunca se ejecuta bajo
    # `pytest tests/phase7_audit.py` (pytest importa el módulo, no lo corre como script).
    # La CI venía "corriendo" este archivo sin verificar realmente nada. Requiere el
    # servidor levantado en 127.0.0.1:8000 (ver .github/workflows/python.yml) -- si no
    # está, run_level2_live_audit lo detecta y este assert falla en vez de dar falso OK.
    auditor = Phase7Auditor()
    auditor.run_level1_static_audit()
    auditor.run_level2_live_audit()
    auditor.generate_report()
    assert auditor.score == auditor.max_score, (
        f"Phase7 audit: {auditor.score}/{auditor.max_score} checks pasaron."
    )


if __name__ == "__main__":
    auditor = Phase7Auditor()
    auditor.run_level1_static_audit()
    auditor.run_level2_live_audit()
    auditor.generate_report()
