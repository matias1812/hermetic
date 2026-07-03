import math

class SteganalysisEvasionTester:
    """
    Evaluates steganalysis resistance of steganographic carriers.
    """

    @staticmethod
    def run_chi_squared_test(data: bytearray | list[int]) -> tuple[float, bool]:
        if not data:
            return 1.0, True

        length = len(data)
        observed = [0] * 256
        for byte in data:
            observed[byte] += 1

        expected = length / 256.0
        if expected < 1.0:
            return 0.5, True

        chi_sq_stat = 0.0
        for obs in observed:
            chi_sq_stat += ((obs - expected) ** 2) / expected

        z = (chi_sq_stat - 255.0) / math.sqrt(510.0)
        p_value = 0.5 * (1.0 - math.erf(z / math.sqrt(2.0)))
        return p_value, p_value > 0.01

    @staticmethod
    def run_rs_correlation_test(data: bytearray) -> tuple[float, bool]:
        if len(data) < 2:
            return 0.0, True

        mean = sum(data) / len(data)
        var = sum((x - mean) ** 2 for x in data) / len(data)

        if var == 0:
            return 1.0, False

        covariance = 0.0
        for i in range(len(data) - 1):
            covariance += (data[i] - mean) * (data[i+1] - mean)
        covariance /= (len(data) - 1)

        correlation = covariance / var
        return correlation, abs(correlation) < 0.15
