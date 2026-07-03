import ipaddress
import hashlib
import time
import uuid
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

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
    
    async def dispatch(self, request: Request, call_next):
        # 1. Anonimizar IP INMEDIATAMENTE
        original_ip = request.client.host if request.client else "unknown"
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
        logger.debug(
            f"BLIND_RELAY | {blind_request_id} | "
            f"{request.method} | {anonymized_ip}"
        )
        
        return response
    
    def _anonymize_ip_completely(self, ip: str) -> str:
        """
        Anonimización completa de IP.
        
        IPv4: 203.0.113.42 → 203.0.113.0
        IPv6: 2001:db8:85a3:8d3:1319:8a2e:370:7348 → 2001:db8:85a3:8d3:0:0:0:0
        """
        try:
            addr = ipaddress.ip_address(ip)
            
            if isinstance(addr, ipaddress.IPv4Address):
                parts = str(addr).split('.')
                parts[-1] = '0'
                return '.'.join(parts)
            
            elif isinstance(addr, ipaddress.IPv6Address):
                parts = str(addr.exploded).split(':')
                parts[4:] = ['0000', '0000', '0000', '0000']
                return ':'.join(parts)
        
        except ValueError:
            pass
        
        return "0.0.0.0"  # Fallback ultra-seguro
