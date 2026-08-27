"""
Regresión para el bypass de autenticación en el handshake WebSocket /ws/{client_id}
(auditoría 2026-08-27).

Antes del fix: si la firma faltaba o era inválida, el servidor aceptaba la conexión
igual con tal de que client_id (= SHA3-256(alias), público) correspondiera a un
usuario registrado. El cliente legítimo (sync_manager.js) siempre firma antes de
mandar "auth" — el fallback era una puerta trasera pura para conectarse como
cualquier usuario e interceptar en tiempo real los mensajes dirigidos a esa cuenta.
"""
import hashlib
import time
import unittest

from fastapi.testclient import TestClient
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from hermes_backend.network_core.api import app
from hermes_backend.network_core.db_connection import db

ORIGIN_HEADERS = {"origin": "http://localhost:8000"}


class TestWebSocketAuthRequiresRealSignature(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.alias = f"audit_ws_test_{int(time.time() * 1000)}"
        self.client_id = hashlib.sha3_256(self.alias.encode()).hexdigest()

        self.sk = Ed25519PrivateKey.generate()
        self.pk = self.sk.public_key()
        self.sphincs_pk_hex = self.pk.public_bytes_raw().hex()

        reg = self.client.post("/api/register", json={
            "client_id": self.client_id,
            "kyber_pk_hex": "bb" * 32,
            "sphincs_pk_hex": self.sphincs_pk_hex,
        })
        self.assertEqual(reg.status_code, 200, reg.text)

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

    def test_ws_connect_without_signature_is_rejected(self):
        with self.client.websocket_connect(f"/ws/{self.client_id}", headers=ORIGIN_HEADERS) as ws:
            ws.send_text('{"type": "auth", "timestamp": 1}')
            with self.assertRaises(Exception):
                # El servidor debe cerrar la conexión (WS_1008_POLICY_VIOLATION), no mandar auth_ok
                ws.receive_json()

    def test_ws_connect_with_another_users_signature_is_rejected(self):
        attacker_sk = Ed25519PrivateKey.generate()
        timestamp = int(time.time())
        sig = attacker_sk.sign(str(timestamp).encode("utf-8")).hex()
        with self.client.websocket_connect(f"/ws/{self.client_id}", headers=ORIGIN_HEADERS) as ws:
            ws.send_text(f'{{"type": "auth", "timestamp": {timestamp}, "signature": "{sig}"}}')
            with self.assertRaises(Exception):
                ws.receive_json()

    def test_ws_connect_with_real_signature_succeeds(self):
        timestamp = int(time.time())
        sig = self.sk.sign(str(timestamp).encode("utf-8")).hex()
        with self.client.websocket_connect(f"/ws/{self.client_id}", headers=ORIGIN_HEADERS) as ws:
            ws.send_text(f'{{"type": "auth", "timestamp": {timestamp}, "signature": "{sig}"}}')
            reply = ws.receive_json()
            self.assertEqual(reply, {"type": "auth_ok"})


if __name__ == "__main__":
    unittest.main()
