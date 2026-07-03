import threading
import time

def _zeroize(buf: bytearray):
    for i in range(len(buf)):
        buf[i] = 0

class EphemeralStore:
    """
    RAM-based ephemeral key-value store with TTL.
    """

    def __init__(self, cleanup_interval: float = 1.0):
        self._store = {}
        self._lock = threading.Lock()
        self._cleanup_interval = cleanup_interval
        self._running = True
        
        self._cleaner_thread = threading.Thread(target=self._cleanup_loop, daemon=True)
        self._cleaner_thread.start()

    def set(self, key: str, value: bytearray, ttl_seconds: float = 300.0):
        if not isinstance(value, bytearray):
            raise TypeError("EphemeralStore values must be mutable bytearrays.")

        expiry = time.time() + ttl_seconds
        
        with self._lock:
            if key in self._store:
                old_val, _ = self._store[key]
                _zeroize(old_val)
                
            copied_value = bytearray(value)
            self._store[key] = (copied_value, expiry)

    def get(self, key: str) -> bytearray | None:
        with self._lock:
            if key not in self._store:
                return None
            
            value, expiry = self._store[key]
            if time.time() > expiry:
                return None
                
            return bytearray(value)

    def remove(self, key: str):
        with self._lock:
            if key in self._store:
                value, _ = self._store.pop(key)
                _zeroize(value)

    def _cleanup_loop(self):
        while self._running:
            time.sleep(self._cleanup_interval)
            now = time.time()
            expired_keys = []
            
            with self._lock:
                for key, (value, expiry) in list(self._store.items()):
                    if now > expiry:
                        expired_keys.append(key)
                        
                for key in expired_keys:
                    value, _ = self._store.pop(key)
                    try:
                        _zeroize(value)
                    except Exception:
                        pass

    def stop(self):
        self._running = False
        with self._lock:
            for key, (value, _) in list(self._store.items()):
                try:
                    _zeroize(value)
                except Exception:
                    pass
            self._store.clear()
