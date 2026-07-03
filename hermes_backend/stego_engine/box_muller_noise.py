import math
import secrets

class BoxMullerNoiseGenerator:
    """
    Generates cryptographically secure Gaussian noise using the Box-Muller transform
    driven exclusively by CSPRNG entropy (secrets.token_bytes).
    """

    def generate_gaussian_noise(
        self, 
        samples: int, 
        mu: float = 0.0, 
        sigma: float = 1e-9
    ) -> list[float]:
        noise = []

        while len(noise) < samples:
            raw_bytes = secrets.token_bytes(16)
            u1 = int.from_bytes(raw_bytes[:8], 'big') / (2**64)
            u2 = int.from_bytes(raw_bytes[8:], 'big') / (2**64)

            u1 = max(u1, 2**-53)
            u2 = max(u2, 2**-53)

            r = math.sqrt(-2.0 * math.log(u1))
            theta = 2.0 * math.pi * u2

            z0 = r * math.cos(theta)
            z1 = r * math.sin(theta)

            noise.append(mu + sigma * z0)
            if len(noise) < samples:
                noise.append(mu + sigma * z1)

        return noise[:samples]
