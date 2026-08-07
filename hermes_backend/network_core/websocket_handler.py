from fastapi import WebSocket
from typing import Dict
import json
import logging
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes

# NOTE: This module currently contains legacy WebSocket helper logic.
# The active WebSocket endpoint is routed in `hermes_backend.network_core.api`.
# Keep this module only for backward compatibility and future refactor tracking.

logger = logging.getLogger(__name__)

class SecurityError(Exception):
    """Error de seguridad (fail-closed)."""
    pass

def _zeroize(buf: bytearray):
    for i in range(len(buf)):
        buf[i] = 0

class WebSocketConnectionManager:
    """
    Manages active WebSocket connections.
    """

    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.session_keys: Dict[str, bytearray] = {}
        self.lock = threading_lock = __import__('threading').Lock()

    async def connect(self, client_id: str, websocket: WebSocket):
        await websocket.accept()
        with self.lock:
            self.active_connections[client_id] = websocket

    def disconnect(self, client_id: str):
        with self.lock:
            if client_id in self.active_connections:
                del self.active_connections[client_id]
            if client_id in self.session_keys:
                key = self.session_keys.pop(client_id)
                _zeroize(key)

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        await websocket.send_text(json.dumps(message))

    async def broadcast_system_message(self, message_text: str):
        payload = {"type": "system", "content": message_text}
        with self.lock:
            targets = list(self.active_connections.values())
        for connection in targets:
            try:
                await connection.send_text(json.dumps(payload))
            except Exception as e:
                logger.warning(f"Failed to send broadcast to socket: {e}")

    def register_session_key(self, client_id: str, key: bytearray):
        with self.lock:
            if client_id in self.session_keys:
                old_key = self.session_keys[client_id]
                _zeroize(old_key)
            self.session_keys[client_id] = bytearray(key)

    def rotate_session_key(self, client_id: str) -> bytearray:
        with self.lock:
            if client_id not in self.session_keys:
                raise ValueError(f"No active session key registered for client {client_id}")

            old_key = self.session_keys[client_id]
            
            hkdf = HKDF(
                algorithm=hashes.SHA512(),
                length=32,
                salt=None,
                info=b'session_key_rotation_pfs',
            )
            new_key_bytes = hkdf.derive(bytes(old_key))
            new_key = bytearray(new_key_bytes)

            _zeroize(old_key)
            self.session_keys[client_id] = new_key
            return bytearray(new_key)

    def validate_nonce(self, aes_nonce) -> bytes:
        """
        Validates and normalizes the AES nonce.
        """
        if isinstance(aes_nonce, str):
            try:
                aes_nonce = bytes.fromhex(aes_nonce)
            except ValueError:
                raise SecurityError("Invalid nonce hex format")
        
        if not isinstance(aes_nonce, bytes) or len(aes_nonce) != 12:
            raise SecurityError(
                f"Nonce must be 12 bytes, got {type(aes_nonce).__name__} "
                f"with length {len(aes_nonce) if hasattr(aes_nonce, '__len__') else 'unknown'}"
            )
        return aes_nonce

