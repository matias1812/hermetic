import logging
import gc
import re
import sys

logger = logging.getLogger(__name__)

SENSITIVE_PATTERNS = [
    re.compile(r'(?i)(session_key|kyber_sk|sphincs_sk|private_key|secret_key|token|otp_token|signature)["\']?\s*[:=]\s*["\']?([a-f0-9]{16,})'),
    re.compile(r'(?i)(bearer\s+)[A-Za-z0-9\-\._~\+\/]+=*'),
    re.compile(r'(?i)(encrypted_blob_hex|encrypted_message_hex|kyber_ciphertext|aes_nonce|sphincs_pk_hex|kyber_pk_hex|receiver_kyber_sk_hex|sender_sphincs_sk_hex)["\']?\s*[:=]\s*["\']?([a-f0-9]{16,})'),
]


def sanitize_log_input(value: str) -> str:
    """Elimina saltos de línea y caracteres de control para evitar Log Injection."""
    if value is None:
        return ""
    sanitized = str(value).replace("\r", "").replace("\n", " ").replace("\t", " ")
    return re.sub(r"\s+", " ", sanitized).strip()


class SensitiveDataRedactor(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = sanitize_log_input(record.msg)
            for pattern in SENSITIVE_PATTERNS:
                record.msg = pattern.sub(r"\1: [REDACTED]", record.msg)

        if record.args:
            if isinstance(record.args, dict):
                for key, value in record.args.items():
                    if any(s in str(key).lower() for s in ["key", "secret", "token", "sk", "signature"]):
                        record.args[key] = "[REDACTED]"
                    elif isinstance(value, str):
                        record.args[key] = sanitize_log_input(value)
            elif isinstance(record.args, tuple):
                record.args = tuple(
                    sanitize_log_input(item) if isinstance(item, str) else item
                    for item in record.args
                )
        return True


class AmnesiaEnforcer:
    """
    Controlador de Amnesia del Servidor.
    Garantiza que no queden datos residuales en memoria y monitorea los límites de RAM.
    """
    
    @staticmethod
    def force_garbage_collection():
        """Fuerza la recolección de basura para limpiar objetos descartados de la RAM."""
        gc.collect()
        
    @staticmethod
    def get_ram_usage_mb() -> float:
        """Retorna el uso de memoria RAM actual en megabytes."""
        try:
            import psutil
            process = psutil.Process()
            return process.memory_info().rss / (1024 * 1024)
        except ImportError:
            # Fallback simple
            return 0.0

    @staticmethod
    def configure_amnesia_logging():
        """Configura los loggers para prevenir fugas accidentales a disco."""
        # Remover cualquier handler de archivo de los loggers principales
        root = logging.getLogger()
        for h in list(root.handlers):
            if isinstance(h, logging.FileHandler):
                root.removeHandler(h)

        # Solo permitir logs a stdout con formato ciego
        formatter = logging.Formatter('HERMES_AMNESIA | %(asctime)s UTC | %(levelname)s | %(name)s | %(message)s')
        stdout_handler = logging.StreamHandler(sys.stdout)
        stdout_handler.setFormatter(formatter)
        stdout_handler.addFilter(SensitiveDataRedactor())

        # Reconfigurar root logger
        root.handlers = [stdout_handler]
        root.setLevel(logging.INFO)
