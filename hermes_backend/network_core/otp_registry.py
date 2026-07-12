import hashlib
import logging
import time
from typing import Dict
import threading
import uuid

try:
    import hermes_ffi
    NATIVE_AVAILABLE = hasattr(hermes_ffi, "PyOTPKeyRegistry")
except ImportError:
    NATIVE_AVAILABLE = False

from hermes_backend.network_core.db_connection import db, DatabaseError

logger = logging.getLogger(__name__)


class SessionKeyRegistry:
    """
    Registro de hashes de claves de sesion KEM con politica fail-closed.

    CONTEXTO HISTORICO: Este modulo se llama 'otp_registry.py' por razones
    historicas. El sistema NO implementa OTP. Lo que se registra son hashes
    SHA3-256 de las claves de sesion KEM (derivadas de ML-KEM-1024) para
    prevenir reuso de la misma clave de sesion en multiples mensajes.

    PRINCIPIO FAIL-CLOSED:
    Si el registro falla -> RECHAZAR la operacion.
    NUNCA continuar si no se puede verificar no-reuso.
    """

    def __init__(self):
        self._lock = threading.RLock()
        self.memory_cache: Dict[str, dict] = {}  # key_hash -> {'state': str, 'registered_at': float, 'token': bytes}
        self.TTL_SECONDS = 300 # Igual que Rust

        self.use_native = NATIVE_AVAILABLE
        if self.use_native:
            try:
                self.native_registry = hermes_ffi.PyOTPKeyRegistry()
            except Exception as e:
                logger.warning(f"Failed to initialize native registry: {e}")
                self.use_native = False

    def claim(self, key: bytes) -> bytes | None:
        """
        Intenta reclamar el uso de una firma (hash) atómicamente.
        Si ya existe (o falla), devuelve None. Si tiene éxito devuelve un claim_token.
        """
        key_hash = hashlib.sha3_256(key).hexdigest()

        with self._lock:
            # Prune expired
            now = time.time()
            expired_keys = [
                k for k, v in self.memory_cache.items() 
                if now - v['registered_at'] >= self.TTL_SECONDS
            ]
            for k in expired_keys:
                del self.memory_cache[k]

            if key_hash in self.memory_cache:
                return None

            if len(self.memory_cache) >= 100_000:
                logger.critical("RegistryCapacityError: OTPKeyRegistry is at max capacity")
                return None

            if self.use_native:
                try:
                    # El nuevo API devuelve bytes (token) si reclamó el hash con éxito
                    token = self.native_registry.claim(list(key))
                    if token is not None:
                        return bytes(token)
                    return None
                except Exception as e:
                    logger.warning(f"Native registry claim failed: {e}")

            # Fallback a la BD si falla el nativo o no está disponible
            try:
                if db.is_key_used(key_hash):
                    return None
                token_bytes = uuid.uuid4().bytes
                self.memory_cache[key_hash] = {
                    'state': 'pending',
                    'registered_at': now,
                    'token': token_bytes
                }
                return token_bytes
            except DatabaseError:
                logger.critical("Error verificando claim en BD. Denegando acceso.")
                raise

    def commit(self, key: bytes, claim_token: bytes) -> None:
        """
        Consolida el uso tras un descifrado exitoso.
        """
        key_hash = hashlib.sha3_256(key).hexdigest()
        with self._lock:
            entry = self.memory_cache.get(key_hash)
            if entry and entry['state'] == 'pending' and entry['token'] == claim_token:
                entry['state'] = 'consumed'
                entry['registered_at'] = time.time()
            else:
                return
            
            if self.use_native:
                try:
                    self.native_registry.commit(list(key), list(claim_token))
                except Exception as e:
                    logger.warning(f"Native registry commit failed: {e}")

            try:
                db.mark_key_used(key_hash, int(time.time()) + 259200)
            except DatabaseError:
                logger.critical("Error escribiendo commit en BD.")
                # Si falla, no hay forma segura de revertir, la transaccion queda inconsistente en BD
                # pero segura en RAM.

    def reject(self, key: bytes, claim_token: bytes) -> None:
        """
        Rechaza el mensaje por un fallo determinista criptografico. 
        Lo marca como consumido/rechazado para evitar reintentos continuos del mismo mensaje corrupto.
        """
        key_hash = hashlib.sha3_256(key).hexdigest()
        with self._lock:
            entry = self.memory_cache.get(key_hash)
            if entry and entry['state'] == 'pending' and entry['token'] == claim_token:
                entry['state'] = 'rejected'
                entry['registered_at'] = time.time()
            else:
                return
            
            if self.use_native:
                try:
                    self.native_registry.reject(list(key), list(claim_token))
                except Exception as e:
                    logger.warning(f"Native registry reject failed: {e}")

            try:
                db.mark_key_used(key_hash, int(time.time()) + 259200) # Logica de DB no distingue rejected/consumed aún
            except DatabaseError:
                logger.critical("Error escribiendo reject en BD.")

    def release(self, key: bytes, claim_token: bytes) -> None:
        """
        Libera un claim previo si hubo fallo transitorio interno, para permitir reintentos.
        """
        key_hash = hashlib.sha3_256(key).hexdigest()
        with self._lock:
            entry = self.memory_cache.get(key_hash)
            if entry and entry['state'] == 'pending' and entry['token'] == claim_token:
                del self.memory_cache[key_hash]

            if self.use_native:
                try:
                    self.native_registry.release(list(key), list(claim_token))
                except Exception as e:
                    logger.warning(f"Native registry release failed: {e}")


# Alias de compatibilidad — mantiene imports existentes funcionando
# sin propagar el nombre incorrecto al codigo nuevo.
OTPKeyRegistry = SessionKeyRegistry

