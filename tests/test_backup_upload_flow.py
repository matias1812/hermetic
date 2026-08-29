"""
Antes: auto_backup_trigger.js mandaba signature: "dummy_signature" (literal) y sin
header Authorization a /api/backup — verify_client_signature siempre rechazaba,
así que el auto-backup a la nube nunca funcionaba (fallaba en silencio, atrapado
por el try/catch de performBackup). Este test prueba que el flujo real (login +
firma Ed25519 real + Bearer token), el mismo que ahora usa auto_backup_trigger.js,
efectivamente funciona de punta a punta.
"""
import hashlib
import time
import unittest

from fastapi.testclient import TestClient
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from hermes_backend.network_core.api import app
from hermes_backend.network_core.db_connection import db


class TestBackupUploadFlow(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.alias = f"audit_backup_flow_test_{int(time.time() * 1000)}"
        self.client_id = hashlib.sha3_256(self.alias.encode()).hexdigest()
        self.sk = Ed25519PrivateKey.generate()
        self.sphincs_pk_hex = self.sk.public_key().public_bytes_raw().hex()

        reg = self.client.post("/api/register", json={
            "client_id": self.client_id,
            "kyber_pk_hex": "dd" * 32,
            "sphincs_pk_hex": self.sphincs_pk_hex,
        })
        self.assertEqual(reg.status_code, 200, reg.text)

    def tearDown(self):
        try:
            conn = db._get_connection()
            cur = conn.cursor()
            if db.is_postgres:
                cur.execute("DELETE FROM cloud_backups WHERE user_hash = %s", (self.client_id,))
                cur.execute("DELETE FROM users WHERE id_hash = %s", (self.client_id,))
            else:
                cur.execute("DELETE FROM cloud_backups WHERE user_hash = ?", (self.client_id,))
                cur.execute("DELETE FROM users WHERE id_hash = ?", (self.client_id,))
            conn.commit()
            cur.close()
            conn.close()
        except Exception:
            pass

    def _sign(self, timestamp: int) -> str:
        return self.sk.sign(str(timestamp).encode("utf-8")).hex()

    def test_real_signed_backup_upload_succeeds(self):
        login_ts = int(time.time())
        login = self.client.post("/api/login", json={
            "client_id": self.client_id,
            "password": "",
            "kyber_pk_hex": "dd" * 32,
            "sphincs_pk_hex": self.sphincs_pk_hex,
            "timestamp": login_ts,
            "signature": self._sign(login_ts),
        })
        self.assertEqual(login.status_code, 200, login.text)
        token = login.json()["token"]

        # anti-replay opera sobre los bytes de la firma: si backup_ts == login_ts, firmar
        # el mismo str(timestamp) produce la misma firma que /api/login ya consumió.
        backup_ts = login_ts + 1
        res = self.client.post(
            "/api/backup",
            json={
                "user_hash": self.client_id,
                "encrypted_data_hex": "aa" * 32,
                "backup_id": "backup-1",
                "backup_type": "full",
                "parent_id": None,
                "timestamp": backup_ts,
                "signature": self._sign(backup_ts),
                "version": 1,
                "algorithm": "AES-256-GCM",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(res.status_code, 200, res.text)


if __name__ == "__main__":
    unittest.main()
