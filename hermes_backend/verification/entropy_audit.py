import secrets
import math

class EntropyTestsVerify:
    """
    Executes NIST SP 800-22 inspired statistical tests.
    """

    @staticmethod
    def run_test() -> dict:
        summary = {
            "name": "Sanity checks estadísticos inspirados en pruebas básicas de SP 800-22",
            "passed": False,
            "logs": [],
            "metrics": {}
        }
        
        try:
            # Generate key bytes using secrets CSPRNG
            num_keys = 30
            key_size = 50
            
            bits = ""
            for _ in range(num_keys):
                key = secrets.token_bytes(key_size)
                bits += ''.join(format(byte, '08b') for byte in key)
                
            n = len(bits)
            s_obs = sum(1 if bit == '1' else -1 for bit in bits)
            s_star = abs(s_obs) / (n ** 0.5)
            p_monobit = math.erfc(s_star / (2 ** 0.5))

            ones = bits.count('1')
            zeros = n - ones
            pi = ones / n
            
            if abs(pi - 0.5) >= (2.0 / (n ** 0.5)):
                p_runs = 0.0
            else:
                v_obs = 1 + sum(1 for i in range(n - 1) if bits[i] != bits[i+1])
                num = abs(v_obs - 2.0 * n * pi * (1.0 - pi))
                den = 2.0 * (2.0 * n) ** 0.5 * pi * (1.0 - pi)
                p_runs = math.erfc(num / den)
            
            summary["logs"].append(f"Aggregated statistical audit pool: {n} bits.")
            summary["logs"].append("NIST SP 800-22 tests run on the collective output buffer.")
            
            summary["metrics"]["aggregated_bits"] = n
            summary["metrics"]["monobit_p_value"] = p_monobit
            summary["metrics"]["runs_p_value"] = p_runs
            
            summary["logs"].append(f"Monobit test: p-value = {p_monobit:.6f}")
            summary["logs"].append(f"Runs test: p-value = {p_runs:.6f}")
            
            # Shannon entropy calculation
            sample_key = secrets.token_bytes(2000)
            entropy = 0.0
            counts = [0] * 256
            for b in sample_key:
                counts[b] += 1
            for count in counts:
                if count > 0:
                    p = count / 2000
                    entropy -= p * math.log2(p)
                    
            summary["metrics"]["sample_shannon_entropy"] = entropy
            summary["logs"].append(f"Sample key Shannon entropy (2000 bytes): {entropy:.6f} bits/byte.")
            
            passed = (p_monobit >= 0.001) and (p_runs >= 0.001) and (entropy > 7.80)
            summary["passed"] = passed
            
            if passed:
                summary["logs"].append("PASSED: Empirical sanity checks passed (sample satisfies NIST SP 800-22 empirical thresholds).")
            else:
                summary["logs"].append("FAILED: Key pool failed empirical randomness thresholds.")
                
        except Exception as e:
            summary["logs"].append(f"Execution failed: {e}")
        return summary

if __name__ == '__main__':
    import json
    print(json.dumps(EntropyTestsVerify.run_test(), indent=2))


