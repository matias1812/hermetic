import ipaddress
import hashlib
import time
import uuid
import logging
import ctypes
import os
import sys
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

# Carga dinámica de la librería Rust
lib_path = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 
    "hermes_ip_middleware", 
    "target", 
    "release",
    "hermes_ip_middleware.dll" if sys.platform == "win32" else "libhermes_ip_middleware.so"
)

try:
    ip_lib = ctypes.CDLL(lib_path)
    ip_lib.anonymize_ip.argtypes = [ctypes.c_char_p]
    ip_lib.anonymize_ip.restype = ctypes.POINTER(ctypes.c_char)
    ip_lib.free_anonymized_ip.argtypes = [ctypes.POINTER(ctypes.c_char)]
    ip_lib.free_anonymized_ip.restype = None
except Exception as e:
    logger.error(f"No se pudo cargar la librería Rust de IP: {e}")
    ip_lib = None

class TotalPrivacyMiddleware(BaseHTTPMiddleware):
    """
    Middleware que garantiza CEGUERA TOTAL del servidor.
    
    REGLAS ESTRICTAS:
    1. IPv4: Reemplazar último octeto con 0 (192.168.1.42 → 192.168.1.0)
    2. IPv6: Reemplazar últimos 64 bits con 0 (2001:db8::1:2:3:4 → 2001:db8::0:0:0:0)
    3. NO almacenar User-Agent
    4. NO almacenar headers HTTP
    5. NO generar logs de acceso
    6. Solo contador ciego para rate limiting
    """

    def __init__(self, app):
        super().__init__(app)
        if os.getenv("TESTING_MODE") == "1":
            logger.warning("==================================================")
            logger.warning("WARNING: TESTING_MODE IS ACTIVE. X-Test-IP ENABLED")
            logger.warning("==================================================")
    
    async def dispatch(self, request: Request, call_next):
        # 1. Anonimizar IP INMEDIATAMENTE
        original_ip = request.client.host if request.client else "unknown"
        if os.getenv("TESTING_MODE") == "1" and original_ip in ("127.0.0.1", "::1", "localhost"):
            original_ip = request.headers.get("X-Test-IP", original_ip)
        anonymized_ip = self._anonymize_ip_completely(original_ip)
        
        # 2. Generar request ID ciego (sin información)
        blind_request_id = hashlib.sha3_256(
            f"{uuid.uuid4()}{time.time()}".encode()
        ).hexdigest()[:8]
        
        # 3. Guardar SOLO IP anonimizada en request state
        request.state.blind_ip = anonymized_ip
        request.state.blind_id = blind_request_id
        
        # Sobrescribir request.client para que logs internos u endpoints usen la IP anonimizada
        if request.client:
            # Note: client is a read-only namedtuple Address(host, port)
            # We can mock it or overwrite the host attribute if possible, but request.state is safer.
            # In FastAPI, we can access request.state.blind_ip
            pass

        # 4. Modificar headers para eliminar User-Agent y otros datos identificativos
        # FastAPI headers are immutable, but we can access them or strip them if we build a custom request.
        # However, just not logging/accessing them is sufficient.
        
        # Procesar request
        response = await call_next(request)
        
        # SOLO log ciego (sin información sensible, IPs reales o UA)
        logger.info(
            f"BLIND_RELAY | {blind_request_id} | "
            f"{request.method} | {anonymized_ip}"
        )
        
        return response
    
    def _anonymize_ip_completely(self, ip: str) -> str:
        """
        Anonimización completa de IP delegada estricta a Rust.
        """
        if ip_lib:
            try:
                ip_bytes = ip.encode('utf-8')
                ptr = ip_lib.anonymize_ip(ip_bytes)
                if ptr:
                    result_bytes = ctypes.cast(ptr, ctypes.c_char_p).value
                    result = result_bytes.decode('utf-8', errors='ignore')
                    ip_lib.free_anonymized_ip(ptr)
                    return result
            except Exception as e:
                logger.critical(f"CRITICAL PRIVACY FAILURE: Fallo en anonymize_ip de Rust: {e}. Activando modo degradado (0.0.0.0)")
        else:
            logger.critical("CRITICAL PRIVACY FAILURE: Libreria Rust ip_lib no cargada. Activando modo degradado (0.0.0.0)")
        
        # Fallback ultra-seguro: placeholder de log cuando la anonimizacion real
        # (Rust ip_lib) no esta disponible, NO un bind de socket -- Bandit B104
        # ("hardcoded_bind_all_interfaces") es un falso positivo aca, pensado para
        # detectar host="0.0.0.0" en server.bind()/app.run(), no un string devuelto para
        # loguear en vez de la IP real.
        return "0.0.0.0"  # nosec B104
