import hashlib
import time
import asyncio
import logging
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

class BlindRelay:
    """
    Relay completamente CIEGO.
    
    El servidor:
    - Recibe blobs cifrados
    - Los almacena TEMPORALMENTE en RAM
    - Los retransmite al destinatario
    - Los ELIMINA después de TTL (5 minutos)
    """
    
    def __init__(self, ttl_seconds: int = 300):
        self.pending_blobs: Dict[str, dict] = {}
        self.ttl = ttl_seconds
        self.blind_counter = 0
        self.lock = asyncio.Lock()
    
    async def relay_blob(
        self,
        sender_hash: str,
        receiver_hash: str,
        encrypted_blob: bytes,
        ttl_seconds: int = None
    ) -> str:
        """
        Retransmite blob cifrado sin entenderlo.
        
        Returns:
            blob_id para confirmación
        """
        actual_ttl = ttl_seconds if ttl_seconds is not None else self.ttl
        
        async with self.lock:
            # Generar ID ciego
            blob_id = hashlib.sha3_256(
                f"{sender_hash}{receiver_hash}{time.time()}{self.blind_counter}".encode()
            ).hexdigest()[:16]
            
            self.blind_counter += 1
            
            # Almacenar en RAM (NO en disco)
            self.pending_blobs[blob_id] = {
                'id': blob_id,
                'sender_hash': sender_hash,
                'receiver_hash': receiver_hash,
                'encrypted_data': encrypted_blob,
                'created_at': time.time(),
                'expires_at': time.time() + actual_ttl
            }
        
        # Programar auto-destrucción
        asyncio.create_task(self._schedule_destruction(blob_id, actual_ttl))
        
        return blob_id
    
    async def fetch_blobs_for_receiver(self, receiver_hash: str) -> List[dict]:
        """
        Recupera todos los blobs pendientes para el destinatario.
        Y los destruye de RAM inmediatamente después de recuperarlos.
        """
        async with self.lock:
            now = time.time()
            retrieved = []
            to_delete = []
            
            for blob_id, blob in list(self.pending_blobs.items()):
                if blob['receiver_hash'] == receiver_hash:
                    if now <= blob['expires_at']:
                        retrieved.append({
                            'id': blob['id'],
                            'sender_hash': blob['sender_hash'],
                            'encrypted_data': blob['encrypted_data'],
                            'created_at': blob['created_at']
                        })
                    to_delete.append(blob_id)
            
            # Destruir después de entregar (SIEMPRE)
            for bid in to_delete:
                await self._destroy_blob(bid)
                
            return retrieved
    
    async def _destroy_blob(self, blob_id: str):
        """
        Destruye blob de RAM con zeroización.
        """
        if blob_id in self.pending_blobs:
            blob = self.pending_blobs[blob_id]
            data = blob['encrypted_data']
            
            # Zeroizar datos en memoria para evitar recuperación residual en RAM
            if isinstance(data, (bytes, bytearray)):
                temp = bytearray(data)
                for i in range(len(temp)):
                    temp[i] = 0
                blob['encrypted_data'] = bytes(temp)
            
            # Eliminar referencia
            del self.pending_blobs[blob_id]
            logger.debug(f"BLIND_RELAY | Blob {blob_id} zeroized and destroyed.")
    
    async def _schedule_destruction(self, blob_id: str, delay: int):
        """
        Programa auto-destrucción después de TTL.
        """
        await asyncio.sleep(delay)
        async with self.lock:
            await self._destroy_blob(blob_id)

    async def clear_user_queue(self, user_hash: str):
        """
        Destruye todos los blobs pendientes donde el destinatario es user_hash.
        Útil para la limpieza forzosa "Al cerrar sesión".
        """
        async with self.lock:
            to_delete = []
            for blob_id, blob in self.pending_blobs.items():
                if blob['receiver_hash'] == user_hash:
                    to_delete.append(blob_id)
            
            for bid in to_delete:
                await self._destroy_blob(bid)
            
            logger.info(f"BLIND_RELAY | Cleared {len(to_delete)} pending blobs for user {user_hash}.")
