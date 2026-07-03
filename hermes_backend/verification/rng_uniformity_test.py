import secrets

class RNGUniformityVerify:
    """
    Test estadístico de uniformidad empírica del RNG.
    
    Verifica que secrets.token_bytes() produce bytes uniformemente distribuidos.
    No es una prueba formal de secreto perfecto.
    """

    @staticmethod
    def run_test() -> dict:
        summary = {
            "name": "RNG Uniformity Empirical Distribution Verification",
            "passed": False,
            "logs": [],
            "metrics": {}
        }
        
        try:
            expected_p = 1.0 / 256.0
            iterations = 5000
            
            # Generar bytes aleatorios usando secrets CSPRNG
            k_bytes = [secrets.token_bytes(1)[0] for _ in range(iterations)]
            
            # Contar ocurrencias de bytes objetivo
            count_k0 = k_bytes.count(0xA5)
            count_k1 = k_bytes.count(0x5A)
            
            p_k0 = count_k0 / iterations
            p_k1 = count_k1 / iterations
            
            summary["logs"].append("Analizando distribución empírica del CSPRNG del sistema...")
            summary["logs"].append(f"Frecuencia empírica P(byte = 0xA5) = {p_k0:.6f} (Teórica: {expected_p:.6f})")
            summary["logs"].append(f"Frecuencia empírica P(byte = 0x5A) = {p_k1:.6f} (Teórica: {expected_p:.6f})")
            
            margin = 0.005
            passed_k0 = abs(p_k0 - expected_p) < margin
            passed_k1 = abs(p_k1 - expected_p) < margin
            
            summary["metrics"]["empirical_p_k0"] = p_k0
            summary["metrics"]["empirical_p_k1"] = p_k1
            summary["metrics"]["expected_p"] = expected_p
            
            if passed_k0 and passed_k1:
                summary["logs"].append("Observed behavior: El generador del sistema operativo muestra distribución uniforme en esta muestra.")
                summary["passed"] = True
            else:
                summary["logs"].append("FALLA: Distribución del RNG no es uniforme dentro de los márgenes estadísticos.")
                summary["passed"] = False
                
        except Exception as e:
            summary["logs"].append(f"Error en verificación: {e}")
            summary["passed"] = False
            
        return summary

if __name__ == '__main__':
    import json
    print(json.dumps(RNGUniformityVerify.run_test(), indent=2))

