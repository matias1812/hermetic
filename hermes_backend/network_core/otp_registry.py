import hashlib
import logging
from typing import Set

try:
    import hermes_native
    NATIVE_AVAILABLE = hasattr(hermes_native, "PyOTPKeyRegistry")
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
        self.memory_cache: Set[str] = set()  # Cache en RAM (hashes, no claves)

        self.use_native = NATIVE_AVAILABLE
        if self.use_native:
            try:
                self.native_registry = hermes_native.PyOTPKeyRegistry()
            except Exception as e:
                logger.warning(f"Failed to initialize native registry: {e}")
                self.use_native = False

    def is_key_used(self, key: bytes) -> bool:
        """
        Verifica si el hash de una clave de sesion ya fue registrado.

        FAIL-CLOSED:
        Si la BD falla -> lanzar excepcion (no asumir 'no usada').

        Raises:
            DatabaseError: Si no se puede verificar.
        """
        key_hash = hashlib.sha3_256(key).hexdigest()

        # Verificar cache en RAM (rapido)
        if key_hash in self.memory_cache:
            return True

        if self.use_native:
            try:
                if self.native_registry.is_key_used(list(key)):
                    return True
            except Exception as e:
                logger.warning(f"Native registry key check failed: {e}")

        # Verificar en BD
        try:
            return db.is_otp_key_used(key_hash)
        except DatabaseError:
            # FAIL-CLOSED: No podemos verificar -> RECHAZAR
            logger.critical(
                "No se pudo verificar reuso de clave de sesion. "
                "Operacion RECHAZADA por seguridad."
            )
            raise  # Propagar error

    def register_key(self, key: bytes) -> None:
        """
        Registra el hash de una clave de sesion como usada.

        FAIL-CLOSED:
        Si el registro falla -> lanzar excepcion.
        La operacion de cifrado DEBE abortarse.

        Raises:
            DatabaseError: Si no se puede registrar.
        """
        key_hash = hashlib.sha3_256(key).hexdigest()

        # Registrar en cache RAM
        self.memory_cache.add(key_hash)

        if self.use_native:
            try:
                self.native_registry.register_key(list(key))
            except Exception as e:
                logger.warning(f"Native registry key registration failed: {e}")

        # Registrar en BD
        try:
            db.register_otp_key(key_hash)
        except DatabaseError:
            # FAIL-CLOSED: No podemos registrar -> RECHAZAR
            logger.critical(
                "No se pudo registrar clave de sesion en BD. "
                "Operacion RECHAZADA. Clave NO usada."
            )
            # Revertir cache RAM
            self.memory_cache.discard(key_hash)
            raise  # Propagar error


# Alias de compatibilidad — mantiene imports existentes funcionando
# sin propagar el nombre incorrecto al codigo nuevo.
OTPKeyRegistry = SessionKeyRegistry

