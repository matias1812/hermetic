"""
hermes_backend/network_core/load_balancer.py

FASE 5 – Balanceo de carga y Rate Limiting (HermesChat v7)

Proporciona:
  - ConnectionLimiter : límite de conexiones WebSocket simultáneas
  - RateLimiter       : ventana deslizante por usuario para REST y WS

Para producción a gran escala usar NGINX + Redis.
Esta implementación es adecuada para instancias únicas de hasta ~1000 usuarios.
"""

import threading
import time
import logging
from collections import defaultdict
from typing import Dict, List

logger = logging.getLogger(__name__)


class ConnectionLimiter:
    """
    Limita el número de conexiones WebSocket activas simultáneas.

    Configuración via env:
      MAX_WS_CONNECTIONS (default: 1000)
      WS_RATE_PER_SECOND (default: 10 nuevas conexiones/s)
    """

    def __init__(self, max_connections: int = 1000, max_new_per_second: int = 10):
        self._max = max_connections
        self._max_new_per_second = max_new_per_second
        self._active = 0
        self._recent_timestamps: List[float] = []
        self._lock = threading.Lock()

    def at_capacity(self) -> bool:
        """Devuelve True si no se pueden aceptar más conexiones."""
        with self._lock:
            return self._active >= self._max

    def can_accept_new(self) -> bool:
        """
        Verifica límite de conexiones Y rate de nuevas conexiones por segundo.
        """
        now = time.time()
        with self._lock:
            if self._active >= self._max:
                return False

            # Limpiar timestamps > 1 s
            self._recent_timestamps = [ts for ts in self._recent_timestamps if now - ts < 1.0]

            if len(self._recent_timestamps) >= self._max_new_per_second:
                return False

            return True

    def accept(self) -> None:
        """Registra aceptación de nueva conexión."""
        with self._lock:
            self._active += 1
            self._recent_timestamps.append(time.time())

    def release(self) -> None:
        """Registra cierre de conexión."""
        with self._lock:
            self._active = max(0, self._active - 1)

    @property
    def active_count(self) -> int:
        with self._lock:
            return self._active


# ---------------------------------------------------------------------------


class RateLimiter:
    """
    Rate limiter de ventana deslizante por usuario.

    Límites predeterminados:
      REST : 100 requests / 60 s
      WS   : 10 mensajes / 1 s
      IMG  : 5 imágenes / 60 s
    """

    def __init__(self):
        self._rest: Dict[str, List[float]] = defaultdict(list)
        self._ws: Dict[str, List[float]] = defaultdict(list)
        self._img: Dict[str, List[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def _check(
        self, store: Dict[str, List[float]], user_id: str, limit: int, window: float
    ) -> bool:
        """
        Ventana deslizante genérica.

        Returns:
            True si la solicitud está dentro del límite.
        """
        now = time.time()
        with self._lock:
            timestamps = store[user_id]
            # Eliminar entradas fuera de la ventana
            store[user_id] = [ts for ts in timestamps if now - ts < window]

            if len(store[user_id]) >= limit:
                return False

            store[user_id].append(now)
            return True

    def check_rest(self, user_id: str, limit: int = 100, window: float = 60.0) -> bool:
        """100 requests REST por minuto."""
        return self._check(self._rest, user_id, limit, window)

    def check_ws(self, user_id: str, limit: int = 10, window: float = 1.0) -> bool:
        """10 mensajes WebSocket por segundo."""
        return self._check(self._ws, user_id, limit, window)

    def check_image(self, user_id: str, limit: int = 5, window: float = 60.0) -> bool:
        """5 subidas de imagen por minuto."""
        return self._check(self._img, user_id, limit, window)
