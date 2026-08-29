"""
BACKLOG.md #1 — reconciliación post-pérdida-de-datos. reconciliation_manager.js
está enganchado a un evento real (hermes:logged_in, dispara en cada login) con la
UI ya completa, pero dependía de GET /api/user/state y DELETE /api/user/purge, que
no existían. Estos tests prueban el ciclo completo: registrar una relación,
recuperarla vía /api/user/state (con el shape exacto que consume
reconciliation_manager.js: {contacts: [{userId}], groups: [{groupId}]}), quitarla,
y despoblar todo.
"""
import hashlib
import time
import unittest

from fastapi.testclient import TestClient
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from hermes_backend.network_core.api import app
from hermes_backend.network_core.db_connection import db


class TestReconciliation(unittest.TestCase):
    """Un solo registro+login para toda la clase (setUpClass), no uno por test —
    /api/login tiene rate limit (correcto, es login real) que una suite grande de
    tests puede saturar si cada método hace el suyo. Cada test aísla su propio
    estado purgando relaciones en setUp()."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.alias = f"audit_reconcile_{int(time.time() * 1000)}"
        cls.client_id = hashlib.sha3_256(cls.alias.encode()).hexdigest()
        cls.sk = Ed25519PrivateKey.generate()
        cls.sphincs_pk_hex = cls.sk.public_key().public_bytes_raw().hex()

        reg = cls.client.post("/api/register", json={
            "client_id": cls.client_id, "kyber_pk_hex": "ff" * 32,
            "sphincs_pk_hex": cls.sphincs_pk_hex,
        })
        assert reg.status_code == 200, reg.text

        login_ts = int(time.time())
        login = cls.client.post("/api/login", json={
            "client_id": cls.client_id, "password": "",
            "kyber_pk_hex": "ff" * 32, "sphincs_pk_hex": cls.sphincs_pk_hex,
            "timestamp": login_ts, "signature": cls.sk.sign(str(login_ts).encode("utf-8")).hex(),
        })
        assert login.status_code == 200, login.text
        cls.token = login.json()["token"]

    def setUp(self):
        db.purge_relationships(self.client_id)

    @classmethod
    def tearDownClass(cls):
        try:
            db.purge_relationships(cls.client_id)
            conn = db._get_connection()
            cur = conn.cursor()
            if db.is_postgres:
                cur.execute("DELETE FROM users WHERE id_hash = %s", (cls.client_id,))
            else:
                cur.execute("DELETE FROM users WHERE id_hash = ?", (cls.client_id,))
            conn.commit()
            cur.close()
            conn.close()
        except Exception:
            pass

    def _sign(self, ts: int) -> str:
        return self.sk.sign(str(ts).encode("utf-8")).hex()

    def _auth(self):
        return {"Authorization": f"Bearer {self.token}"}

    def test_state_starts_empty(self):
        res = self.client.get("/api/user/state", headers=self._auth())
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertEqual(data["contacts"], [])
        self.assertEqual(data["groups"], [])

    def test_add_relationship_and_read_state(self):
        add = self.client.post("/api/user/relationships",
            json={"relationship_type": "contact", "target_id": "bob_hash_123"},
            headers=self._auth())
        self.assertEqual(add.status_code, 200, add.text)

        add_group = self.client.post("/api/user/relationships",
            json={"relationship_type": "group", "target_id": "group_xyz"},
            headers=self._auth())
        self.assertEqual(add_group.status_code, 200, add_group.text)

        state = self.client.get("/api/user/state", headers=self._auth())
        self.assertEqual(state.status_code, 200, state.text)
        data = state.json()
        # Shape exacto que consume reconciliation_manager.js's loadServerState()
        self.assertEqual(data["contacts"], [{"userId": "bob_hash_123"}])
        self.assertEqual(data["groups"], [{"groupId": "group_xyz"}])

    def test_add_is_idempotent(self):
        for _ in range(3):
            res = self.client.post("/api/user/relationships",
                json={"relationship_type": "contact", "target_id": "bob_hash_123"},
                headers=self._auth())
            self.assertEqual(res.status_code, 200, res.text)
        state = self.client.get("/api/user/state", headers=self._auth())
        self.assertEqual(len(state.json()["contacts"]), 1)

    def test_invalid_relationship_type_rejected(self):
        res = self.client.post("/api/user/relationships",
            json={"relationship_type": "not_a_real_type", "target_id": "x"},
            headers=self._auth())
        self.assertEqual(res.status_code, 400, res.text)

    def test_remove_relationship(self):
        self.client.post("/api/user/relationships",
            json={"relationship_type": "contact", "target_id": "bob_hash_123"},
            headers=self._auth())
        rm = self.client.request("DELETE", "/api/user/relationships",
            json={"relationship_type": "contact", "target_id": "bob_hash_123"},
            headers=self._auth())
        self.assertEqual(rm.status_code, 200, rm.text)
        state = self.client.get("/api/user/state", headers=self._auth())
        self.assertEqual(state.json()["contacts"], [])

    def test_purge_removes_everything_without_body(self):
        """reconciliation_manager.js's startFresh() manda DELETE sin body -- confirma
        que funciona solo con el Bearer token, sin exigir un payload extra."""
        self.client.post("/api/user/relationships",
            json={"relationship_type": "contact", "target_id": "bob"}, headers=self._auth())
        self.client.post("/api/user/relationships",
            json={"relationship_type": "group", "target_id": "g1"}, headers=self._auth())

        purge = self.client.request("DELETE", "/api/user/purge", headers=self._auth())
        self.assertEqual(purge.status_code, 200, purge.text)
        self.assertEqual(purge.json()["purged"], 2)

        state = self.client.get("/api/user/state", headers=self._auth())
        self.assertEqual(state.json(), {"contacts": [], "groups": [], "lastSeen": None, "deviceCount": 1})

    def test_relationships_require_session_token(self):
        res = self.client.get("/api/user/state")
        self.assertEqual(res.status_code, 401, res.text)
        res2 = self.client.post("/api/user/relationships", json={"relationship_type": "contact", "target_id": "x"})
        self.assertEqual(res2.status_code, 401, res2.text)

    def test_cannot_read_another_users_state(self):
        """El session_id viene del token verificado, nunca del cliente -- no hay
        forma de pedir el estado de otro usuario aunque se conozca su hash."""
        other_alias = f"audit_reconcile_other_{int(time.time() * 1000)}"
        other_id = hashlib.sha3_256(other_alias.encode()).hexdigest()
        other_sk = Ed25519PrivateKey.generate()
        self.client.post("/api/register", json={
            "client_id": other_id, "kyber_pk_hex": "ab" * 32,
            "sphincs_pk_hex": other_sk.public_key().public_bytes_raw().hex(),
        })
        db.add_relationship(other_id, "contact", "secret_contact")

        # Con MI token, /api/user/state siempre devuelve MI propio estado (session_id
        # extraído del token, no hay parámetro para pedir el de otro usuario).
        state = self.client.get("/api/user/state", headers=self._auth())
        self.assertNotIn({"userId": "secret_contact"}, state.json()["contacts"])

        db.purge_relationships(other_id)
        conn = db._get_connection()
        cur = conn.cursor()
        if db.is_postgres:
            cur.execute("DELETE FROM users WHERE id_hash = %s", (other_id,))
        else:
            cur.execute("DELETE FROM users WHERE id_hash = ?", (other_id,))
        conn.commit()
        cur.close()
        conn.close()


if __name__ == "__main__":
    unittest.main()
