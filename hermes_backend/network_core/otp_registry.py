import hashlib
import logging
import time
from typing import Dict, Tuple
import threading
import uuid
import os

try:
    import hermes_ffi
    NATIVE_AVAILABLE = hasattr(hermes_ffi, "NativeReplayRegistry")
except ImportError:
    NATIVE_AVAILABLE = False

from hermes_backend.network_core.db_connection import db, DatabaseError

logger = logging.getLogger(__name__)

class ReplayRegistry:
    """
    Registro unificado de Replay con soporte para separación de dominios.
    
    Dominios soportados:
    - HERMES-REPLAY-ENVELOPE-V1 (TTL 300s): Firmas de los envelopes criptográficos E2E.
    - HERMES-REPLAY-API-AUTH-V1 (TTL 300s): Firmas de autenticación para endpoints API.
    - HERMES-REPLAY-RELAY-V1 (TTL 86400s): Nonces de los webhooks de Relay (1 día).
    """

    DOMAIN_ENVELOPE = "HERMES-REPLAY-ENVELOPE-V1"
    DOMAIN_API = "HERMES-REPLAY-API-AUTH-V1"
    DOMAIN_RELAY = "HERMES-REPLAY-RELAY-V1"
    DOMAIN_JWT = "HERMES-REPLAY-JWT-V1"

    def __init__(self):
        self._lock = threading.RLock()
        self.memory_cache: Dict[Tuple[str, str], dict] = {}

        env = os.getenv("HERMES_ENV", "development")
        backend = os.getenv("HERMES_REPLAY_BACKEND", "memory")
        db_url = os.getenv("DATABASE_URL", "mysql://root:root@localhost/hermeschat")

        if env == "production" and backend != "sql":
            raise RuntimeError("Production requires the shared SQL replay backend (HERMES_REPLAY_BACKEND=sql)")

        self.use_native = NATIVE_AVAILABLE
        if self.use_native:
            try:
                if backend == "sql":
                    if not hasattr(hermes_ffi, "SqlReplayRegistry"):
                        raise RuntimeError("SqlReplayRegistry not found in hermes_ffi")
                    self.native_registry = hermes_ffi.SqlReplayRegistry(db_url)
                    self.native_registry.health_check()
                else:
                    self.native_registry = hermes_ffi.NativeReplayRegistry()
            except Exception as e:
                logger.warning(f"Failed to initialize native registry: {e}")
                if env == "production":
                    raise RuntimeError(f"Failed to initialize production SQL registry: {e}")
                self.use_native = False

    def _claim(self, domain: str, key: bytes, ttl_seconds: int) -> bytes | None:
        key_hash = hashlib.sha3_256(key).hexdigest()
        cache_key = (domain, key_hash)

        with self._lock:
            now = time.time()
            expired_keys = [
                k for k, v in self.memory_cache.items() 
                if now >= v['expires_at']
            ]
            for k in expired_keys:
                del self.memory_cache[k]

            if self.use_native:
                try:
                    token = self.native_registry.claim(domain, bytes(key), ttl_seconds)
                    if token is not None:
                        return bytes(token)
                    return None
                except PermissionError:
                    return None
                except Exception as e:
                    logger.warning(f"Native registry claim failed: {e}")
                    if os.getenv("HERMES_ENV") == "production":
                        raise
                    return None

            if cache_key in self.memory_cache:
                return None
            if len(self.memory_cache) >= 100_000:
                logger.critical("RegistryCapacityError: ReplayRegistry is at max capacity")
                return None

            token_bytes = uuid.uuid4().bytes
            self.memory_cache[cache_key] = {
                'state': 'pending',
                'expires_at': now + ttl_seconds,
                'token': token_bytes
            }
            return token_bytes

    def _commit(self, domain: str, key: bytes, claim_token: bytes, ttl_seconds: int) -> None:
        key_hash = hashlib.sha3_256(key).hexdigest()
        cache_key = (domain, key_hash)

        with self._lock:
            if self.use_native:
                try:
                    self.native_registry.commit(domain, bytes(key), bytes(claim_token), ttl_seconds)
                    return
                except Exception as e:
                    logger.warning(f"Native registry commit failed: {e}")
                    if os.getenv("HERMES_ENV") == "production":
                        raise

            entry = self.memory_cache.get(cache_key)
            if entry and entry['state'] == 'pending' and entry['token'] == claim_token:
                entry['state'] = 'consumed'
                entry['expires_at'] = time.time() + ttl_seconds

    def _reject(self, domain: str, key: bytes, claim_token: bytes, ttl_seconds: int) -> None:
        key_hash = hashlib.sha3_256(key).hexdigest()
        cache_key = (domain, key_hash)

        with self._lock:
            if self.use_native:
                try:
                    self.native_registry.reject(domain, bytes(key), bytes(claim_token), ttl_seconds)
                    return
                except Exception as e:
                    logger.warning(f"Native registry reject failed: {e}")
                    if os.getenv("HERMES_ENV") == "production":
                        raise

            entry = self.memory_cache.get(cache_key)
            if entry and entry['state'] == 'pending' and entry['token'] == claim_token:
                entry['state'] = 'rejected'
                entry['expires_at'] = time.time() + ttl_seconds

    def _release(self, domain: str, key: bytes, claim_token: bytes) -> None:
        key_hash = hashlib.sha3_256(key).hexdigest()
        cache_key = (domain, key_hash)

        with self._lock:
            if self.use_native:
                try:
                    self.native_registry.release(domain, bytes(key), bytes(claim_token))
                    return
                except Exception as e:
                    logger.warning(f"Native registry release failed: {e}")
                    if os.getenv("HERMES_ENV") == "production":
                        raise

            entry = self.memory_cache.get(cache_key)
            if entry and entry['state'] == 'pending' and entry['token'] == claim_token:
                del self.memory_cache[cache_key]

    # --- Domain-specific wrappers ---

    def claim_envelope_signature(self, signature: bytes) -> bytes | None:
        return self._claim(self.DOMAIN_ENVELOPE, signature, 300)
    
    def commit_envelope_signature(self, signature: bytes, token: bytes) -> None:
        self._commit(self.DOMAIN_ENVELOPE, signature, token, 300)

    def reject_envelope_signature(self, signature: bytes, token: bytes) -> None:
        self._reject(self.DOMAIN_ENVELOPE, signature, token, 300)

    def release_envelope_signature(self, signature: bytes, token: bytes) -> None:
        self._release(self.DOMAIN_ENVELOPE, signature, token)

    def claim_api_signature(self, signature: bytes) -> bytes | None:
        return self._claim(self.DOMAIN_API, signature, 300)

    def commit_api_signature(self, signature: bytes, token: bytes) -> None:
        self._commit(self.DOMAIN_API, signature, token, 300)

    def release_api_signature(self, signature: bytes, token: bytes) -> None:
        self._release(self.DOMAIN_API, signature, token)

    def claim_jti(self, jti: bytes, ttl: int) -> bytes | None:
        """Reclama un JTI de Bearer token. TTL debe ser el tiempo restante del token.
        Retorna None si el JTI ya fue usado (replay detectado)."""
        return self._claim(self.DOMAIN_JWT, jti, ttl)

    def commit_jti(self, jti: bytes, claim_token: bytes, ttl: int) -> None:
        """Confirma el JTI como consumido. Debe llamarse inmediatamente tras claim_jti exitoso."""
        self._commit(self.DOMAIN_JWT, jti, claim_token, ttl)

    def claim_relay_nonce(self, nonce: bytes) -> bytes | None:
        return self._claim(self.DOMAIN_RELAY, nonce, 86400)

    def commit_relay_nonce(self, nonce: bytes, token: bytes) -> None:
        self._commit(self.DOMAIN_RELAY, nonce, token, 86400)

    def release_relay_nonce(self, nonce: bytes, token: bytes) -> None:
        self._release(self.DOMAIN_RELAY, nonce, token)

# Mantenemos OTPKeyRegistry para compatibilidad con código existente (HermesNativeCore) 
# temporalmente, pero re-enrutando al nuevo domain_envelope
class OTPKeyRegistryAdapter:
    def __init__(self, registry: ReplayRegistry):
        self.registry = registry

    def claim(self, key: bytes) -> bytes | None:
        return self.registry.claim_envelope_signature(key)
    def commit(self, key: bytes, token: bytes) -> None:
        self.registry.commit_envelope_signature(key, token)
    def reject(self, key: bytes, token: bytes) -> None:
        self.registry.reject_envelope_signature(key, token)
    def release(self, key: bytes, token: bytes) -> None:
        self.registry.release_envelope_signature(key, token)

global_registry = ReplayRegistry()
OTPKeyRegistry = OTPKeyRegistryAdapter(global_registry)
