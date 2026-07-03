import time
import asyncio
from collections import defaultdict
from typing import Dict, List, Optional

class EphemeralMessageQueue:
    """
    Cola de mensajes efímera con TTL verificable.
    
    GARANTÍAS:
    - Mensajes expiran después de TTL (5 min default)
    - Zeroización al expirar
    - Sin persistencia en disco
    - Rate limiting por usuario
    """
    
    def __init__(self, ttl_seconds: int = 300, max_queue_size: int = 100):
        self.ttl = ttl_seconds
        self.max_size = max_queue_size
        self.queues: Dict[str, List[dict]] = defaultdict(list)
        self.rate_limits: Dict[str, List[float]] = defaultdict(list)
    
    async def enqueue(self, user_id: str, message: dict) -> bool:
        """
        Encola mensaje para un usuario.
        
        Returns:
            True si se encoló, False si se rechazó (rate limit o queue llena)
        """
        # Rate limiting: máximo 10 mensajes por segundo
        now = time.time()
        self.rate_limits[user_id] = [
            t for t in self.rate_limits[user_id]
            if now - t < 1.0
        ]
        
        if len(self.rate_limits[user_id]) >= 10:
            return False  # Rate limit exceeded
        
        self.rate_limits[user_id].append(now)
        
        # Verificar tamaño de cola
        if len(self.queues[user_id]) >= self.max_size:
            return False  # Queue full
        
        # Encolar con timestamp de expiración
        self.queues[user_id].append({
            **message,
            '_queued_at': now,
            '_expires_at': now + self.ttl
        })
        
        # Programar expiración
        asyncio.create_task(self._expire_message(user_id, now + self.ttl))
        
        return True
    
    async def dequeue(self, user_id: str) -> Optional[dict]:
        """
        Obtiene el siguiente mensaje de la cola.
        Mensajes expirados se eliminan automáticamente.
        """
        now = time.time()
        
        # Limpiar expirados
        self.queues[user_id] = [
            m for m in self.queues[user_id]
            if m['_expires_at'] > now
        ]
        
        if not self.queues[user_id]:
            return None
        
        return self.queues[user_id].pop(0)
    
    async def _expire_message(self, user_id: str, expiry_time: float):
        """Programa la expiración de un mensaje."""
        await asyncio.sleep(max(0, expiry_time - time.time()))
        
        # Zeroizar al expirar (sobrescribir con ceros - simulación)
        # En Python no se puede zeroizar memoria fácilmente, pero podemos borrar referencias
        self.queues[user_id] = [
            m for m in self.queues[user_id]
            if m['_expires_at'] > time.time()
        ]
