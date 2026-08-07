import sys
import os
import uvicorn
import webbrowser
import threading
import time
from dotenv import load_dotenv

load_dotenv()

# Ensure the root directory containing our custom oqs package is at the top of sys.path
root_dir = os.path.dirname(os.path.abspath(__file__))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

# Import formal verification suite to run diagnostics on start
try:
    from hermes_backend.verification.memory_safety import MemorySafetyVerify
    from hermes_backend.verification.entropy_audit import EntropyTestsVerify
    from hermes_backend.verification.timing_analysis import TimingTestsVerify
    from hermes_backend.verification.rng_uniformity_test import RNGUniformityVerify
    from hermes_backend.verification.e2e_crypto_verify import EndToEndCryptoVerify
    from hermes_backend.verification.chaos_verifier import ChaosEngineeringVerify
except ImportError as e:
    print(f"Error importing modules: {e}")
    sys.exit(1)

def run_preflight_audit():
    print("=" * 60)
    print("      HERMESCHAT V7.2 PRE-FLIGHT AUDIT")
    print("=" * 60)
    
    # 1. Memory safety test
    res = MemorySafetyVerify.run_test()
    print(f"[{'PASS' if res['passed'] else 'FAIL'}] {res['name']}")
    for log in res["logs"]:
        print(f"  -> {log}")
        
    # 2. Entropy test
    res = EntropyTestsVerify.run_test()
    print(f"[{'PASS' if res['passed'] else 'FAIL'}] {res['name']}")
    for log in res["logs"]:
        print(f"  -> {log}")
        
    # 3. Timing test
    res = TimingTestsVerify.run_test()
    print(f"[{'PASS' if res['passed'] else 'FAIL'}] {res['name']}")
    for log in res["logs"]:
        print(f"  -> {log}")
        
    # 4. RNG uniformity test
    res = RNGUniformityVerify.run_test()
    print(f"[{'PASS' if res['passed'] else 'FAIL'}] {res['name']}")
    for log in res["logs"]:
        print(f"  -> {log}")
        
    # 5. End-to-End Empirical Crypto Verification
    res = EndToEndCryptoVerify.run_test()
    print(f"[{'PASS' if res['passed'] else 'FAIL'}] {res['name']}")
    for log in res["logs"]:
        print(f"  -> {log}")
        
    # 6. Chaos Engineering & Resilience Verification
    res = ChaosEngineeringVerify.run_test()
    print(f"[{'PASS' if res['passed'] else 'FAIL'}] {res['name']}")
    for log in res["logs"]:
        print(f"  -> {log}")
        
    print("=" * 60)
    print("              AUDIT COMPLETE - LAUNCHING SERVER")
    print("=" * 60)

def open_browser():
    # Wait for uvicorn server to start
    time.sleep(1.5)
    print("\nOpening web browser at http://127.0.0.1:8000 ...")
    webbrowser.open("http://127.0.0.1:8000")

if __name__ == "__main__":
    # Run preflight tests
    run_preflight_audit()
    
    # Start thread to open browser
    threading.Thread(target=open_browser, daemon=True).start()
    
    # Run FastAPI web server
    uvicorn.run(
        "hermes_backend.network_core.api:app",
        host="127.0.0.1",
        port=8000,
        log_level="info",
        # Disable uvicorn access log — real IPs must never appear in stdout.
        # PrivacyMiddleware in api.py handles anonymised per-request logging.
        access_log=False,
        reload=False,
    )
