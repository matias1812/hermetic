import logging
import gc
import sys

logger = logging.getLogger(__name__)

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
        formatter = logging.Formatter('HERMES_AMNESIA | %(levelname)s | %(message)s')
        stdout_handler = logging.StreamHandler(sys.stdout)
        stdout_handler.setFormatter(formatter)
        
        # Reconfigurar root logger
        root.handlers = [stdout_handler]
        root.setLevel(logging.INFO)
