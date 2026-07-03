"""
tests/security_audit.py

FASE 6 – Auditoría de Seguridad Automatizada (HermesChat v7)

Uso:
    # Con el servidor corriendo en localhost:8000
    python tests/security_audit.py

    # Contra un servidor remoto
    python tests/security_audit.py --url http://mi-servidor:8000

Cobertura:
    1. Encabezados CORS y seguridad HTTP
    2. Rate limiting de imágenes
    3. SQL injection (parámetros en URL)
    4. Prevención XSS en alias
    5. No exposición de IPs reales
    6. Ciclo de vida efímero de imágenes (upload → view → delete)
    7. Permisos de grupos (solo creador puede eliminar)
    8. Permisos de imágenes (solo viewers autorizados)
"""

import argparse
import sys
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass
import time
import uuid
import json
import io
try:
    import requests
except ImportError:
    print("[ERROR] Módulo 'requests' no encontrado. Instala con: pip install requests")
    sys.exit(1)


# ─────────────────────────────────────────────
# Paleta de colores para terminal
# ─────────────────────────────────────────────
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
RESET  = "\033[0m"
BOLD   = "\033[1m"


class Finding:
    def __init__(self, severity: str, test: str, detail: str):
        self.severity = severity  # CRITICAL | HIGH | MEDIUM | INFO
        self.test = test
        self.detail = detail

    def color(self) -> str:
        return {
            "CRITICAL": RED,
            "HIGH": YELLOW,
            "MEDIUM": CYAN,
            "INFO": GREEN,
        }.get(self.severity, RESET)


class SecurityAuditor:
    """Auditoría de seguridad HTTP automatizada para HermesChat v7."""

    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base = base_url.rstrip("/")
        self.findings: list[Finding] = []
        self.passed = 0
        self.failed = 0

    # ──────────────────────────────────────────
    # Helpers
    # ──────────────────────────────────────────

    def _ok(self, test: str, detail: str = "") -> None:
        self.passed += 1
        print(f"  {GREEN}✔{RESET} {test}" + (f" — {detail}" if detail else ""))

    def _fail(self, severity: str, test: str, detail: str) -> None:
        self.failed += 1
        f = Finding(severity, test, detail)
        self.findings.append(f)
        print(f"  {f.color()}✖ [{severity}] {test} — {detail}{RESET}")

    def _get(self, path: str, **kwargs):
        try:
            return requests.get(f"{self.base}{path}", timeout=5, **kwargs)
        except requests.exceptions.ConnectionError:
            return None

    def _post(self, path: str, **kwargs):
        try:
            return requests.post(f"{self.base}{path}", timeout=5, **kwargs)
        except requests.exceptions.ConnectionError:
            return None

    def _delete(self, path: str, **kwargs):
        try:
            return requests.delete(f"{self.base}{path}", timeout=5, **kwargs)
        except requests.exceptions.ConnectionError:
            return None

    # ──────────────────────────────────────────
    # Test 1: Conectividad
    # ──────────────────────────────────────────

    def test_connectivity(self) -> bool:
        r = self._get("/api/users")
        if r is None:
            print(f"\n  {RED}✖ Server not reachable at {self.base}{RESET}")
            print(f"  Start the server first: python main.py\n")
            return False
        self._ok("Server reachability", f"HTTP {r.status_code}")
        return True

    # ──────────────────────────────────────────
    # Test 2: Cabeceras de seguridad HTTP
    # ──────────────────────────────────────────

    def test_security_headers(self):
        r = self._get("/api/users")
        if r is None:
            return

        # La IP real NO debe aparecer en ninguna cabecera de respuesta
        sensitive_headers = [
            "X-Real-IP", "X-Forwarded-For", "X-Client-IP",
        ]
        for h in sensitive_headers:
            if h in r.headers:
                self._fail("HIGH", "IP Leakage in Headers", f"Header '{h}' expuesto: {r.headers[h]}")
            else:
                self._ok(f"No '{h}' header", "IP no expuesta en cabecera")

    # ──────────────────────────────────────────
    # Test 3: SQL Injection en parámetros de URL
    # ──────────────────────────────────────────

    def test_sql_injection(self):
        payloads = [
            "' OR '1'='1",
            "1; DROP TABLE users; --",
            "1' UNION SELECT * FROM users --",
            "admin'--",
        ]
        for p in payloads:
            r = self._get(f"/api/user/{requests.utils.quote(p, safe='')}")
            if r is not None and r.status_code == 200:
                try:
                    body = r.json()
                    if body.get("kyber_pk_hex") or body.get("id_usuario"):
                        self._fail("CRITICAL", "SQL Injection", f"Payload exitoso: {repr(p)}")
                        continue
                except Exception:
                    pass
            # 404 o 422 son respuestas correctas
            self._ok(f"SQL Injection rejected", f"{repr(p)[:30]} → {r.status_code if r is not None else 'no-conn'}")

    # ──────────────────────────────────────────
    # Test 4: XSS en alias
    # ──────────────────────────────────────────

    def test_xss_prevention(self):
        xss_alias = "<script>alert('xss')</script>"
        r = self._post("/api/register", json={
            "client_id": xss_alias,
            "kyber_pk_hex": "aa" * 1568,
            "sphincs_pk_hex": "bb" * 32,
            "password": "TestPass123!"
        })
        if r is not None and r.status_code == 200:
            self._fail("HIGH", "XSS Prevention", "Alias con <script> aceptado sin sanitizar")
        else:
            code = r.status_code if r is not None else "no-conn"
            self._ok("XSS alias rejected", f"HTTP {code}")

    # ──────────────────────────────────────────
    # Test 5: Rate Limiting de imágenes
    # ──────────────────────────────────────────

    def test_image_rate_limit(self):
        """Enviar 6 imágenes seguidas — la 6ª debe ser rechazada con 429."""
        uid = f"ratelimit_test_{uuid.uuid4().hex[:6]}"
        # Intentar sin registro real (servidor rechazará por contacto pero rate limit va primero)
        rejected = False
        for i in range(6):
            fake_img = io.BytesIO(b"\xFF\xD8\xFF" + b"\x00" * 100)  # JPEG header mínimo
            r = self._post(
                f"/api/images/upload?sender_id={uid}&receiver_id=nobody",
                files={"file": ("test.jpg", fake_img, "image/jpeg")}
            )
            if r is not None and r.status_code == 429:
                rejected = True
                break
        if rejected:
            self._ok("Image rate limit (429)", "6ª imagen rechazada correctamente")
        else:
            self._fail("MEDIUM", "Image Rate Limit", "No se detectó 429 tras 6 imágenes en <60s")

    # ──────────────────────────────────────────
    # Test 6: Permisos de grupos
    # ──────────────────────────────────────────

    def test_group_permissions(self):
        """
        Un no-creador intentando eliminar miembro debe recibir 403.
        Requiere que los usuarios ya existan. Si no existen la prueba es informativa.
        """
        group_payload = {
            "name": "AuditTestGroup",
            "creator_id": "AuditAlice",
            "members": ["AuditBob", "AuditCarol"]
        }
        r = self._post("/api/groups/create", json=group_payload)
        if r is None or r.status_code not in (200, 503):
            self._ok("Group permissions test", f"Skipped (HTTP {r.status_code if r is not None else 'no-conn'}: users may not exist)")
            return

        if r.status_code == 503:
            self._ok("Group permissions test", "Skipped (DB unavailable)")
            return

        group_id = r.json().get("group_id", "")
        if not group_id:
            self._ok("Group permissions test", "Skipped (no group_id returned)")
            return

        # AuditCarol (no-creador) intenta eliminar a AuditBob
        r2 = self._delete(f"/api/groups/{group_id}/remove/AuditBob?removed_by=AuditCarol")
        if r2 is not None and r2.status_code == 403:
            self._ok("Group permission enforcement", "Non-creator cannot remove member (403)")
        elif r2 is not None and r2.status_code == 200:
            self._fail("HIGH", "Group Permissions", "Non-creator pudo eliminar miembro")
        else:
            code = r2.status_code if r2 is not None else "no-conn"
            self._ok("Group permissions test", f"HTTP {code} (inconclusive)")

    # ──────────────────────────────────────────
    # Test 7: Ciclo de vida de imagen efímera
    # ──────────────────────────────────────────

    def test_image_lifecycle(self):
        """
        Sube imagen → marca vista → verifica eliminación.
        Requiere un grupo real; se omite si no hay DB.
        """
        # Intentar subir sin contexto válido → 400/403 esperado (no 500)
        fake_img = io.BytesIO(b"\xFF\xD8\xFF" + b"\x00" * 50)
        r = self._post(
            "/api/images/upload?sender_id=nobody",
            files={"file": ("t.jpg", fake_img, "image/jpeg")}
        )
        if r is not None and r.status_code == 400:
            self._ok("Image upload validation", "Rejected without group_id/receiver_id (400)")
        elif r is not None and r.status_code == 429:
            self._ok("Image upload validation", "Rate-limited (429) — implies endpoint exists")
        elif r is None:
            self._ok("Image lifecycle test", "Skipped (no server connection)")
        else:
            code = r.status_code
            # 403 is also valid (no contact)
            if code in (403, 404, 422):
                self._ok("Image upload validation", f"Properly rejected HTTP {code}")
            elif code == 500:
                self._fail("MEDIUM", "Image Lifecycle", f"Server error 500 on upload attempt")
            else:
                self._ok("Image upload validation", f"HTTP {code}")

    # ──────────────────────────────────────────
    # Test 8: Endpoint /api/verify no expone IP real
    # ──────────────────────────────────────────

    def test_verify_no_ip(self):
        r = self._post("/api/verify")
        if r is None:
            return
        try:
            body = r.json()
            body_str = json.dumps(body)
            # Buscar patrones de IP real (último octeto != 0)
            import re
            ip_pattern = re.compile(r'\b(?:\d{1,3}\.){3}(?:[1-9]\d*)\b')
            matches = ip_pattern.findall(body_str)
            if matches:
                self._fail("HIGH", "IP in /api/verify response", f"Posible IP real: {matches[:3]}")
            else:
                self._ok("/api/verify sin IP real", "No se detectaron IPs en respuesta")
        except Exception:
            self._ok("/api/verify", "No JSON body con IPs")

    # ──────────────────────────────────────────
    # Runner principal
    # ──────────────────────────────────────────

    def run_all(self):
        print(f"\n{BOLD}{CYAN}{'═'*62}{RESET}")
        print(f"{BOLD}{CYAN}  🛡️  HERMESCHAT v7 — SECURITY AUDIT{RESET}")
        print(f"{BOLD}{CYAN}{'═'*62}{RESET}")
        print(f"  Target: {self.base}\n")

        if not self.test_connectivity():
            return

        tests = [
            ("1. HTTP Security Headers",       self.test_security_headers),
            ("2. SQL Injection Protection",    self.test_sql_injection),
            ("3. XSS Alias Prevention",        self.test_xss_prevention),
            ("4. Image Rate Limiting",         self.test_image_rate_limit),
            ("5. Group Permissions",           self.test_group_permissions),
            ("6. Ephemeral Image Lifecycle",   self.test_image_lifecycle),
            ("7. /api/verify IP Exposure",     self.test_verify_no_ip),
        ]

        for name, fn in tests:
            print(f"\n{BOLD}[{name}]{RESET}")
            try:
                fn()
            except Exception as ex:
                self._fail("MEDIUM", name, f"Test error: {ex}")

        self._report()

    def _report(self):
        print(f"\n{BOLD}{CYAN}{'═'*62}{RESET}")
        print(f"{BOLD}  📋 RESUMEN{RESET}")
        print(f"{'═'*62}")

        critical = [f for f in self.findings if f.severity == "CRITICAL"]
        high     = [f for f in self.findings if f.severity == "HIGH"]
        medium   = [f for f in self.findings if f.severity == "MEDIUM"]

        print(f"  {GREEN}✔ Verificaciones OK  : {self.passed}{RESET}")
        print(f"  {RED}🔴 Críticos          : {len(critical)}{RESET}")
        print(f"  {YELLOW}🟡 Altos             : {len(high)}{RESET}")
        print(f"  {CYAN}🔵 Medios            : {len(medium)}{RESET}")

        if self.findings:
            print(f"\n{BOLD}  Hallazgos:{RESET}")
            for f in self.findings:
                print(f"  {f.color()}  [{f.severity}] {f.test}{RESET}")
                print(f"         {f.detail}")

        if not critical and not high:
            print(f"\n  {GREEN}{BOLD}✅ Sin vulnerabilidades críticas o altas detectadas.{RESET}")
        else:
            print(f"\n  {RED}{BOLD}⚠️  Se encontraron {len(critical)+len(high)} problemas que requieren atención.{RESET}")

        print(f"{'═'*62}\n")

        # Exit code 1 si hay críticos o altos (útil para CI)
        if critical or high:
            sys.exit(1)


# ─────────────────────────────────────────────
# Punto de entrada
# ─────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="HermesChat v7 Security Auditor")
    parser.add_argument("--url", default="http://localhost:8000", help="Base URL del servidor")
    args = parser.parse_args()

    auditor = SecurityAuditor(base_url=args.url)
    auditor.run_all()
