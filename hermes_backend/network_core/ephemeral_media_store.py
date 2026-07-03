"""
hermes_backend/network_core/ephemeral_media_store.py

FASE 4 – Almacén de imágenes efímeras en RAM (HermesChat v7)

POLÍTICA:
  - Imágenes NUNCA en disco: solo bytearrays mutables en RAM.
  - Se eliminan cuando TODOS los miembros destinatarios las han visto,
    O cuando expira el TTL máximo (1 hora por defecto).
  - Al eliminar → zeroización de bytearray antes de soltar la referencia.
  - Limpieza automática cada 5 minutos por hilo daemon.
"""

import threading
import time
import logging
from typing import Dict, Optional, Set

logger = logging.getLogger(__name__)


def _zeroize(buf: bytearray) -> None:
    """Sobrescribe el buffer con ceros."""
    for i in range(len(buf)):
        buf[i] = 0


class EphemeralImageStore:
    """
    Almacén en RAM de imágenes cifradas con lifecycle de "todos-la-vieron".

    Estructura de cada entrada::

        {
            'data':           bytearray   # imagen cifrada (AES-256-GCM ciphertext)
            'nonce':          bytearray   # nonce AES-GCM (12 bytes)
            'aes_key':        bytearray   # clave AES efímera (zeroizada al borrar)
            'sender_id':      str
            'group_id':       str | None  # None → DM
            'viewers_needed': set[str]    # quiénes deben verla
            'viewed_by':      set[str]    # quiénes ya la vieron
            'expires_at':     float       # epoch seconds
        }
    """

    def __init__(self, max_ttl_seconds: int = 3600, cleanup_interval: int = 300):
        self._images: Dict[str, dict] = {}
        self._lock = threading.Lock()
        self._max_ttl = max_ttl_seconds
        self._cleanup_interval = cleanup_interval
        self._start_cleanup_thread()

    # ------------------------------------------------------------------
    # Pública API
    # ------------------------------------------------------------------

    def store_image(
        self,
        image_id: str,
        encrypted_data: bytearray,
        nonce: bytearray,
        aes_key: bytearray,
        sender_id: str,
        member_ids: list,
        group_id: Optional[str] = None,
    ) -> None:
        """
        Almacena imagen cifrada en RAM.

        Args:
            image_id:       UUID único de la imagen
            encrypted_data: bytearray con el ciphertext AES-GCM
            nonce:          bytearray 12 bytes
            aes_key:        bytearray 32 bytes (clave AES efímera)
            sender_id:      ID del usuario que envió la imagen
            member_ids:     Lista de todos los IDs que deben verla
                            (el remitente se excluye automáticamente)
            group_id:       ID del grupo (None para DMs)
        """
        viewers_needed: Set[str] = set(member_ids) - {sender_id}

        with self._lock:
            self._images[image_id] = {
                "data": bytearray(encrypted_data),
                "nonce": bytearray(nonce),
                "aes_key": bytearray(aes_key),
                "sender_id": sender_id,
                "group_id": group_id,
                "viewers_needed": viewers_needed,
                "viewed_by": set(),
                "expires_at": time.time() + self._max_ttl,
            }

        logger.info(
            "Imagen %s almacenada en RAM. Viewers needed: %d",
            image_id,
            len(viewers_needed),
        )

    def get_image(self, image_id: str, requester_id: str) -> Optional[dict]:
        """
        Devuelve los datos cifrados si el solicitante es un viewer válido.

        Returns:
            dict con 'data', 'nonce', 'aes_key' o None si no existe / no autorizado
        """
        with self._lock:
            entry = self._images.get(image_id)
            if entry is None:
                return None

            # Verificar expiración
            if time.time() > entry["expires_at"]:
                self._delete_image_locked(image_id)
                return None

            # El remitente puede recuperar (para confirmación) pero sin marca
            if (
                requester_id != entry["sender_id"]
                and requester_id not in entry["viewers_needed"]
            ):
                return None

            return {
                "data": bytes(entry["data"]),
                "nonce": bytes(entry["nonce"]),
                "aes_key": bytes(entry["aes_key"]),
                "sender_id": entry["sender_id"],
                "group_id": entry["group_id"],
            }

    def mark_viewed(self, image_id: str, user_id: str) -> bool:
        """
        Marca la imagen como vista por user_id.

        Returns:
            True si la imagen fue eliminada (todos la vieron), False en caso contrario.
        """
        with self._lock:
            entry = self._images.get(image_id)
            if entry is None:
                return False  # ya fue eliminada o no existe

            # El remitente no cuenta como "viewer"
            if user_id == entry["sender_id"]:
                return False

            entry["viewed_by"].add(user_id)

            # ¿Todos los destinatarios ya la vieron?
            if entry["viewers_needed"].issubset(entry["viewed_by"]):
                self._delete_image_locked(image_id)
                logger.info("Imagen %s eliminada: todos la vieron.", image_id)
                return True

        return False

    def exists(self, image_id: str) -> bool:
        with self._lock:
            return image_id in self._images

    # ------------------------------------------------------------------
    # Limpieza interna
    # ------------------------------------------------------------------

    def _delete_image_locked(self, image_id: str) -> None:
        """Zeroiza y elimina imagen. Debe llamarse con self._lock adquirido."""
        entry = self._images.pop(image_id, None)
        if entry is None:
            return
        _zeroize(entry["data"])
        _zeroize(entry["nonce"])
        _zeroize(entry["aes_key"])

    def _start_cleanup_thread(self) -> None:
        def _cleanup_worker():
            while True:
                time.sleep(self._cleanup_interval)
                now = time.time()
                with self._lock:
                    expired = [
                        img_id
                        for img_id, entry in self._images.items()
                        if now > entry["expires_at"]
                    ]
                    for img_id in expired:
                        self._delete_image_locked(img_id)
                        logger.info("Imagen %s eliminada por TTL.", img_id)

        t = threading.Thread(target=_cleanup_worker, daemon=True, name="EphemeralImageCleaner")
        t.start()
