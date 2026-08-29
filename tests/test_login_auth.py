"""
Regresión para el bypass de autenticación en /api/login (auditoría 2026-08-26/27).

Antes del fix, login_user() emitía un token de sesión válido con solo conocer el
client_id (= hash público del alias) — sin verificar contraseña, firma, ni ninguna
prueba de posesión de clave privada. Cualquiera podía autenticarse como cualquier
usuario registrado. Estos tests prueban que ahora exige una firma Ed25519 real
sobre el timestamp (mismo mecanismo que /api/backup y /api/blobs/clear).
"""
import hashlib
import time
import unittest

from fastapi.testclient import TestClient
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from hermes_backend.network_core.api import app
from hermes_backend.network_core.db_connection import db


class TestLoginRequiresRealSignature(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.alias = f"audit_login_test_{int(time.time() * 1000)}"
        self.client_id = hashlib.sha3_256(self.alias.encode()).hexdigest()

        self.sk = Ed25519PrivateKey.generate()
        self.pk = self.sk.public_key()
        self.sphincs_pk_hex = self.pk.public_bytes_raw().hex()

        reg = self.client.post("/api/register", json={
            "client_id": self.client_id,
            "kyber_pk_hex": "aa" * 32,
            "sphincs_pk_hex": self.sphincs_pk_hex,
        })
        self.assertEqual(reg.status_code, 200, reg.text)

    def tearDown(self):
        # Despoblar: solo este usuario de prueba, TRUNCATE/DELETE nunca DROP.
        try:
            conn = db._get_connection()
            cur = conn.cursor()
            if db.is_postgres:
                cur.execute("DELETE FROM users WHERE id_hash = %s", (self.client_id,))
            else:
                cur.execute("DELETE FROM users WHERE id_hash = ?", (self.client_id,))
            conn.commit()
            cur.close()
            conn.close()
        except Exception:
            pass

    def _sign(self, timestamp: int, key=None) -> str:
        key = key or self.sk
        return key.sign(str(timestamp).encode("utf-8")).hex()

    def test_login_without_signature_is_rejected(self):
        res = self.client.post("/api/login", json={
            "client_id": self.client_id,
            "password": "",
            "kyber_pk_hex": "aa" * 32,
            "sphincs_pk_hex": self.sphincs_pk_hex,
            "timestamp": int(time.time()),
            "signature": "00" * 64,  # firma bien formada pero inválida
        })
        self.assertEqual(res.status_code, 401, res.text)
        self.assertNotIn("token", res.json())

    def test_login_with_another_users_signature_is_rejected(self):
        """Alguien que conoce el client_id (hash público del alias) pero NO la clave
        privada correspondiente no puede autenticarse — el bug original permitía esto."""
        attacker_sk = Ed25519PrivateKey.generate()
        timestamp = int(time.time())
        res = self.client.post("/api/login", json={
            "client_id": self.client_id,
            "password": "",
            "kyber_pk_hex": "aa" * 32,
            "sphincs_pk_hex": self.sphincs_pk_hex,
            "timestamp": timestamp,
            "signature": self._sign(timestamp, key=attacker_sk),
        })
        self.assertEqual(res.status_code, 401, res.text)

    def test_login_with_real_signature_succeeds(self):
        timestamp = int(time.time())
        res = self.client.post("/api/login", json={
            "client_id": self.client_id,
            "password": "",
            "kyber_pk_hex": "aa" * 32,
            "sphincs_pk_hex": self.sphincs_pk_hex,
            "timestamp": timestamp,
            "signature": self._sign(timestamp),
        })
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertIn("token", data)
        self.assertTrue(data["token"].startswith(self.client_id + ":"))

    def test_login_signature_cannot_be_replayed(self):
        """La firma se consume vía el ReplayRegistry — reusarla debe fallar."""
        timestamp = int(time.time())
        sig = self._sign(timestamp)
        body = {
            "client_id": self.client_id,
            "password": "",
            "kyber_pk_hex": "aa" * 32,
            "sphincs_pk_hex": self.sphincs_pk_hex,
            "timestamp": timestamp,
            "signature": sig,
        }
        first = self.client.post("/api/login", json=body)
        self.assertEqual(first.status_code, 200, first.text)

        second = self.client.post("/api/login", json=body)
        self.assertEqual(second.status_code, 401, second.text)


if __name__ == "__main__":
    unittest.main()
