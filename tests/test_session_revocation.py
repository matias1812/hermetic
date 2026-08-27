"""
tests/test_session_revocation.py

Antes de este fix, generate_session_token()'s docstring afirmaba protección
anti-replay vía JTI que en realidad nunca se conectaba a nada (comentario propio
del código: "Hook para revocación futura en logout"). Un token robado quedaba
válido durante las 8 horas completas de su TTL sin importar qué hiciera el
usuario legítimo. Estos tests prueban que /api/logout revoca el token realmente.
"""
import hashlib
import time
import unittest

from fastapi.testclient import TestClient
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from hermes_backend.network_core.api import app
from hermes_backend.network_core.db_connection import db


class TestSessionRevocation(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.alias = f"audit_revoke_test_{int(time.time() * 1000)}"
        self.client_id = hashlib.sha3_256(self.alias.encode()).hexdigest()

        self.sk = Ed25519PrivateKey.generate()
        self.sphincs_pk_hex = self.sk.public_key().public_bytes_raw().hex()

        reg = self.client.post("/api/register", json={
            "client_id": self.client_id,
            "kyber_pk_hex": "cc" * 32,
            "sphincs_pk_hex": self.sphincs_pk_hex,
        })
        self.assertEqual(reg.status_code, 200, reg.text)

        timestamp = int(time.time())
        sig = self.sk.sign(str(timestamp).encode("utf-8")).hex()
        login = self.client.post("/api/login", json={
            "client_id": self.client_id,
            "password": "",
            "kyber_pk_hex": "cc" * 32,
            "sphincs_pk_hex": self.sphincs_pk_hex,
            "timestamp": timestamp,
            "signature": sig,
        })
        self.assertEqual(login.status_code, 200, login.text)
        self.token = login.json()["token"]

    def tearDown(self):
        try:
            conn = db._get_connection()
            cur = conn.cursor()
            if db.is_mysql:
                cur.execute("DELETE FROM users WHERE id_hash = %s", (self.client_id,))
            else:
                cur.execute("DELETE FROM users WHERE id_hash = ?", (self.client_id,))
            conn.commit()
            cur.close()
            conn.close()
        except Exception:
            pass

    def test_token_works_before_logout(self):
        res = self.client.post(
            "/api/backup/fetch",
            json={"user_hash": self.client_id, "timestamp": int(time.time()), "signature": "00" * 32},
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(res.status_code, 200, res.text)

    def test_token_rejected_after_logout(self):
        out = self.client.post("/api/logout", headers={"Authorization": f"Bearer {self.token}"})
        self.assertEqual(out.status_code, 200, out.text)
        self.assertTrue(out.json()["revoked"])

        res = self.client.post(
            "/api/backup/fetch",
            json={"user_hash": self.client_id, "timestamp": int(time.time()), "signature": "00" * 32},
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(res.status_code, 401, res.text)


if __name__ == "__main__":
    unittest.main()
