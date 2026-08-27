"""
Verifica el wire format que ahora usa recovery_system_complete.js's uploadBlob()/
downloadBlob() (redirigido de /api/recovery_blob y GET /api/backup/{id}, que nunca
existieron, a /api/backup y /api/backup/fetch, que sí existen). No ejercita el
JS directamente (bloqueado por una falla de WASM específica del harness de Node al
importar state.js junto con crypto_wasm_bridge.js — no reproduce en el navegador
real, ver los otros tests de scratch/ que sí pasan con el mismo patrón) — en cambio
prueba el formato exacto que ese código arma y consume, contra el backend real.
"""
import hashlib
import time
import unittest

from fastapi.testclient import TestClient
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from hermes_backend.network_core.api import app
from hermes_backend.network_core.db_connection import db


def bytes_to_hex(b: bytes) -> str:
    return b.hex()


class TestRecoveryCloudSyncWireFormat(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.alias = f"audit_recovery_wire_{int(time.time() * 1000)}"
        self.client_id = hashlib.sha3_256(self.alias.encode()).hexdigest()
        self.sk = Ed25519PrivateKey.generate()
        self.sphincs_pk_hex = self.sk.public_key().public_bytes_raw().hex()

        reg = self.client.post("/api/register", json={
            "client_id": self.client_id,
            "kyber_pk_hex": "ee" * 32,
            "sphincs_pk_hex": self.sphincs_pk_hex,
        })
        self.assertEqual(reg.status_code, 200, reg.text)

        login_ts = int(time.time())
        login = self.client.post("/api/login", json={
            "client_id": self.client_id, "password": "",
            "kyber_pk_hex": "ee" * 32, "sphincs_pk_hex": self.sphincs_pk_hex,
            "timestamp": login_ts, "signature": self._sign(login_ts),
        })
        self.assertEqual(login.status_code, 200, login.text)
        self.token = login.json()["token"]

    def tearDown(self):
        try:
            conn = db._get_connection()
            cur = conn.cursor()
            if db.is_mysql:
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

    def _sign(self, ts: int) -> str:
        return self.sk.sign(str(ts).encode("utf-8")).hex()

    def _auth_headers(self):
        return {"Authorization": f"Bearer {self.token}"}

    def test_uploadBlob_payload_shape_is_accepted(self):
        """Exactamente el shape que arma uploadBlob() en recovery_system_complete.js."""
        import uuid
        plaintext_ciphertext = b"\xaa\xbb\xcc" * 20
        # +50 para no colisionar con la firma ya consumida por /api/login en setUp
        # (misma firma sobre str(timestamp) si el segundo coincide -> anti-replay la rechaza)
        ts = int(time.time()) + 50
        backup_id = str(uuid.uuid4())
        res = self.client.post("/api/backup", json={
            "user_hash": self.client_id,
            "encrypted_data_hex": bytes_to_hex(plaintext_ciphertext),
            "backup_id": backup_id,
            "backup_type": "recovery",
            "parent_id": None,
            "timestamp": ts,
            "signature": self._sign(ts),
            "version": 1,
            "algorithm": "AES-GCM/RecoveryKey",
        }, headers=self._auth_headers())
        self.assertEqual(res.status_code, 200, res.text)
        self.backup_id = backup_id
        self.plaintext_ciphertext = plaintext_ciphertext

    def test_downloadBlob_latest_semantics(self):
        """downloadBlob('latest') toma backups[-1] -- confirma que get_cloud_backups
        devuelve ordenado por timestamp ASC (el último elemento es el más reciente)
        y que el campo se llama encrypted_data (no encrypted_data_hex) en la respuesta."""
        import uuid
        first = b"\x01" * 16
        second = b"\x02" * 16
        for i, payload in enumerate([first, second]):
            ts = int(time.time()) + 50 + (i * 10)
            up = self.client.post("/api/backup", json={
                "user_hash": self.client_id,
                "encrypted_data_hex": bytes_to_hex(payload),
                "backup_id": str(uuid.uuid4()),
                "backup_type": "recovery",
                "parent_id": None,
                "timestamp": ts,
                "signature": self._sign(ts),
                "version": 1,
                "algorithm": "AES-GCM/RecoveryKey",
            }, headers=self._auth_headers())
            self.assertEqual(up.status_code, 200, up.text)

        ts = int(time.time()) + 100
        res = self.client.post("/api/backup/fetch", json={
            "user_hash": self.client_id, "timestamp": ts, "signature": self._sign(ts),
        }, headers=self._auth_headers())
        self.assertEqual(res.status_code, 200, res.text)
        backups = res.json()["backups"]
        self.assertGreaterEqual(len(backups), 2)

        # replica exacta de: backups[backups.length - 1]
        latest = backups[-1]
        self.assertIn("encrypted_data", latest)
        recovered = bytes.fromhex(latest["encrypted_data"])
        self.assertEqual(recovered, second, "downloadBlob('latest') no trajo el backup más reciente")


if __name__ == "__main__":
    unittest.main()
