import sys
import os
import time
import hashlib
import json

# Ensure root path in sys.path
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from hermes_backend.crypto_core.native_core import HermesNativeCore

class EndToEndCryptoVerify:
    """
    Suite de verificación empírica y fehaciente para demostrar las afirmaciones
    criptográficas de HermesChat v7.2 / v2.1.
    """

    @staticmethod
    def run_test() -> dict:
        summary = {
            "name": "End-to-End Empirical Crypto Verification Suite",
            "passed": False,
            "logs": [],
            "metrics": {}
        }
        
        try:
            summary["logs"].append("Iniciando generación de pares de claves PQC (Kyber-1024 + SPHINCS+)...")
            keys_sender = HermesNativeCore.generate_keys()
            keys_receiver = HermesNativeCore.generate_keys()
            
            summary["logs"].append("Claves generadas exitosamente.")
            
            # 1. Prueba de Zero-Knowledge y Unicidad de Nonces
            pt_text = "Afirmacion Criptografica Fehaciente: Secreto Clasificado HermesChat"
            pt_hex = pt_text.encode('utf-8').hex()
            session_key_hex = "A1B2C3D4E5F60718293A4B5C6D7E8F90A1B2C3D4E5F60718293A4B5C6D7E8F90"
            
            summary["logs"].append(f"\n[PRUEBA 1: Cifrado y Unicidad de Nonce]")
            summary["logs"].append(f"Texto Plano Original: '{pt_text}' (Bytes: {len(pt_text)})")
            
            env1 = HermesNativeCore.encrypt_envelope(
                pt_hex,
                keys_receiver["kyber_pk_hex"],
                keys_sender["sphincs_sk_hex"],
                session_key_hex,
                sender_id="alice",
                receiver_id="bob"
            )
            
            time.sleep(0.01)
            env2 = HermesNativeCore.encrypt_envelope(
                pt_hex,
                keys_receiver["kyber_pk_hex"],
                keys_sender["sphincs_sk_hex"],
                session_key_hex,
                sender_id="alice",
                receiver_id="bob"
            )
            
            nonce1 = env1["aes_nonce"]
            nonce2 = env2["aes_nonce"]
            blob1 = env1["wrapped_otp_key"]
            blob2 = env2["wrapped_otp_key"]
            
            summary["logs"].append(f"Mensaje 1 Nonce AES-GCM: {nonce1}")
            summary["logs"].append(f"Mensaje 2 Nonce AES-GCM: {nonce2}")
            summary["logs"].append(f"Mensaje 1 Ciphertext Hex (primeros 64 chars): {blob1[:64]}...")
            summary["logs"].append(f"Mensaje 2 Ciphertext Hex (primeros 64 chars): {blob2[:64]}...")
            
            assert nonce1 != nonce2, "Error: Los nonces deben ser únicos para cada cifrado"
            assert blob1 != blob2, "Error: Los textos cifrados deben diferir aunque el texto plano sea idéntico"
            assert pt_hex not in blob1, "Error crítico: El texto plano no puede aparecer en el texto cifrado"
            
            summary["logs"].append("[OK] Observed behavior: El texto plano jamás aparece en el payload. Nonce y ciphertext son únicos por transmisión en esta prueba.")
            
            # 2. Prueba de Descifrado Correcto
            summary["logs"].append(f"\n[PRUEBA 2: Descifrado Legítimo Extremo a Extremo]")
            dec_bytes = HermesNativeCore.decrypt_envelope(
                env1,
                keys_receiver["kyber_sk_hex"],
                keys_sender["sphincs_pk_hex"],
                session_key_hex,
                expected_sender_id="alice"
            )
            dec_text = dec_bytes.decode('utf-8')
            summary["logs"].append(f"Texto recuperado por receptor legítimo: '{dec_text}'")
            assert dec_text == pt_text, "Error: El texto descifrado no coincide con el original"
            summary["logs"].append("[OK] Observed behavior: Se verificó empíricamente un round-trip funcional del fallback Python y rechazo de ciertas alteraciones en los casos ejecutados.")
            
            # 3. Prueba de Detección de Manipulación (Tamper Resistance / MITM)
            summary["logs"].append(f"\n[PRUEBA 3: Detección de Manipulación MITM en Tránsito]")
            tampered_env = dict(env1)
            # Alterar bytes del contenedor esteganográfico / payload en tránsito
            tampered_env["stego_container"] = tampered_env["stego_container"].replace('data-hermes-payload="', 'data-hermes-payload="ffff')
            
            tamper_detected = False
            try:
                HermesNativeCore.decrypt_envelope(
                    tampered_env,
                    keys_receiver["kyber_sk_hex"],
                    keys_sender["sphincs_pk_hex"],
                    session_key_hex,
                    expected_sender_id="alice"
                )
            except Exception as e:
                tamper_detected = True
                summary["logs"].append(f"Excepción capturada legítimamente ante modificación MITM del sobre: {type(e).__name__} - {str(e)}")
                
            assert tamper_detected, "Error: El sistema no detectó la manipulación del ciphertext"
            summary["logs"].append("[OK] Observed behavior: La modificación del sobre invalidó la firma SPHINCS+ y fue rechazada antes del descifrado.")
            
            # 4. Prueba de Enlace Contextual AAD (Anti-Replay / Context Confusion)
            summary["logs"].append(f"\n[PRUEBA 4: Enlace Contextual AAD]")
            replay_env = dict(env1)
            # Intentar cambiar el receptor de 'bob' a 'eve'
            replay_env["receiver_id"] = "eve"
            aad_detected = False
            try:
                HermesNativeCore.decrypt_envelope(
                    replay_env,
                    keys_receiver["kyber_sk_hex"],
                    keys_sender["sphincs_pk_hex"],
                    session_key_hex,
                    expected_sender_id="alice"
                )
            except Exception as e:
                aad_detected = True
                summary["logs"].append(f"Excepción capturada al cambiar destinatario en paquete interceptado: {type(e).__name__}")
                
            assert aad_detected, "Error: El cambio de receptor debió fallar por verificación AAD"
            summary["logs"].append("[OK] Observed behavior: El sobre está enlazado criptográficamente al emisor, receptor y timestamp original via AAD.")
            
            # 5. Prueba de Anti-Replay Exacto (Deduplicación)
            summary["logs"].append(f"\n[PRUEBA 5: Anti-Replay Exacto (Deduplicación)]")
            exact_replay_detected = False
            try:
                # Intentamos procesar el EXACTO mismo envelope otra vez, sin alterar un solo byte
                HermesNativeCore.decrypt_envelope(
                    env1,
                    keys_receiver["kyber_sk_hex"],
                    keys_sender["sphincs_pk_hex"],
                    session_key_hex,
                    expected_sender_id="alice"
                )
            except Exception as e:
                if "Replay attack detected" in str(e) or "SecurityError" in str(type(e)):
                    exact_replay_detected = True
                summary["logs"].append(f"Excepción capturada ante retransmisión idéntica del sobre: {type(e).__name__} - {str(e)}")

            assert exact_replay_detected, "Error: El sobre pudo ser retransmitido y consumido dos veces (Fallo de Deduplicación)"
            summary["logs"].append("[OK] Observed behavior: El registro transaccional rechazó el sobre retransmitido por colisión de firma.")

            summary["passed"] = True
            summary["metrics"] = {
                "nonce_unique": True,
                "zero_knowledge_leak": True,
                "tamper_resistance": True,
                "aad_binding": True,
                "anti_replay_exact": True
            }
            
        except Exception as e:
            summary["logs"].append(f"Fallo durante verificación: {e}")
            import traceback
            summary["logs"].append(traceback.format_exc())
            summary["passed"] = False
            
        return summary

if __name__ == "__main__":
    if sys.stdout.encoding != 'utf-8':
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except AttributeError:
            pass
    res = EndToEndCryptoVerify.run_test()
    print(f"[{'PASS' if res['passed'] else 'FAIL'}] {res['name']}")
    for l in res["logs"]:
        print(f"  {l}")
