import logging

logger = logging.getLogger(__name__)

class SecurityError(Exception):
    pass

class MutableBuffer:
    """
    Mutable bytearray wrapper that zeroizes memory on exit.
    """

    def __init__(self, data: bytearray):
        self._buffer = data
        self._zeroized = False

    @classmethod
    def from_bytes(cls, data: bytes) -> 'MutableBuffer':
        return cls(bytearray(data))

    @classmethod
    def from_plaintext(cls, text: str) -> 'MutableBuffer':
        return cls(bytearray(text.encode('utf-8')))

    def get_buffer(self) -> bytearray:
        if self._zeroized:
            raise SecurityError("Cannot access buffer: Memory has already been zeroized.")
        return self._buffer

    def zeroize(self):
        if not self._zeroized:
            for i in range(len(self._buffer)):
                self._buffer[i] = 0
            self._zeroized = True

    def __enter__(self) -> bytearray:
        return self.get_buffer()

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.zeroize()

    def __del__(self):
        try:
            self.zeroize()
        except Exception as e:
            logger.error(f"MutableBuffer GC zeroization failed: {e}")
