from typing import Union


def safe_zeroize(buffer: Union[bytearray, memoryview, None]) -> None:
    """
    Sobreescribe físicamente la memoria del buffer mutable con ceros.
    """
    if buffer is None:
        return

    if isinstance(buffer, bytearray):
        for i in range(len(buffer)):
            buffer[i] = 0
    elif isinstance(buffer, memoryview) and not buffer.readonly:
        buffer[:] = b'\x00' * len(buffer)
