import math

class SacredGeometryMath:
    """
    Mathematical primitives based on Fibonacci sequences and the Golden Ratio (Phi).
    """

    PHI = (1.0 + math.sqrt(5.0)) / 2.0  # Golden Ratio (~1.6180339887)
    GOLDEN_ANGLE = 2.0 * math.pi * (1.0 - 1.0 / PHI)  # ~137.5 degrees in radians

    @staticmethod
    def generate_fibonacci_sequence(length: int) -> list[int]:
        if length <= 0:
            return []
        if length == 1:
            return [1]
        seq = [1, 1]
        while len(seq) < length:
            seq.append(seq[-1] + seq[-2])
        return seq

    @staticmethod
    def vogel_sunflower_point(index: int, scaling_factor: float = 10.0) -> tuple[float, float]:
        if index < 0:
            raise ValueError("Index must be non-negative.")
        if index == 0:
            return 0.0, 0.0

        r = scaling_factor * math.sqrt(index)
        theta = index * SacredGeometryMath.GOLDEN_ANGLE
        x = r * math.cos(theta)
        y = r * math.sin(theta)
        return x, y

    @staticmethod
    def disperse_sequence(length: int, seed: int) -> list[int]:
        indices = list(range(length))
        multiplier = int(seed * SacredGeometryMath.PHI) | 1
        shuffled = []
        temp = list(indices)
        current = seed
        
        while temp:
            current = (current * multiplier + 1013904223) % 4294967296
            idx = current % len(temp)
            shuffled.append(temp.pop(idx))
            
        return shuffled
