import sys
import os
import json
import hashlib
sys.path.insert(0, os.path.abspath('.'))

from hermes_backend.crypto_core.native_core import HermesNativeCore

def generate():
    kem_algorithm = "ML-KEM-1024"
    aead_algorithm = "AES-256-GCM"
    signature_algorithm = "SLH-DSA-SHA2-128f"
    sender_id = "alice"
    receiver_id = "bob"
    timestamp_int = 1700000000
    ciphertext_kem = bytes.fromhex("000102030405060708090a0b0c0d0e0f")
    ciphertext_kem_pad = ciphertext_kem.ljust(1568, b'\x00')
    aes_nonce = bytes.fromhex("101112131415161718191a1b")
    encrypted_message = bytes.fromhex("1c1d1e1f")

    payload = HermesNativeCore.canonical_signed_payload(
        kem_algorithm,
        aead_algorithm,
        signature_algorithm,
        sender_id,
        receiver_id,
        timestamp_int,
        ciphertext_kem_pad,
        aes_nonce,
        encrypted_message
    )

    digest = hashlib.sha3_256(payload).hexdigest()
    
    with open('test_vectors/canonical_envelope_v1.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    data['vectors'][0]['inputs']['kem_ciphertext_hex'] = ciphertext_kem_pad.hex()
    data['vectors'][0]['inputs']['signature_algorithm'] = signature_algorithm
    data['vectors'][0]['expected']['payload_hex'] = payload.hex()
    data['vectors'][0]['expected']['sha3_256_hex'] = digest

    with open('test_vectors/canonical_envelope_v1.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

if __name__ == "__main__":
    generate()
