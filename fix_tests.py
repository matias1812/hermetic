import os
import glob

for py_file in glob.glob('hermes_backend/verification/*.py'):
    with open(py_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # We want to add expected_sender_id="alice" if it's missing, but it might be easier to just 
    # replace sender_sphincs_pk_hex=... with sender_sphincs_pk_hex=..., expected_sender_id="alice"
    # Or session_key_hex=...
    
    # In extreme_scenarios_verifier.py:
    content = content.replace(
        'session_key_hex=alice_keys["session_key_hex"]\n            )',
        'session_key_hex=alice_keys["session_key_hex"],\n                expected_sender_id="alice"\n            )'
    )
    # In soak_and_fuzz_verifier.py
    content = content.replace(
        'sender_sphincs_pk_hex=alice_keys["sphincs_pk_hex"],\n                    session_key_hex=alice_keys["session_key_hex"]\n                )',
        'sender_sphincs_pk_hex=alice_keys["sphincs_pk_hex"],\n                    session_key_hex=alice_keys["session_key_hex"],\n                    expected_sender_id="alice"\n                )'
    )
    content = content.replace(
        'sender_sphincs_pk_hex=alice_keys["sphincs_pk_hex"],\n                session_key_hex=alice_keys["session_key_hex"]\n            )',
        'sender_sphincs_pk_hex=alice_keys["sphincs_pk_hex"],\n                session_key_hex=alice_keys["session_key_hex"],\n                expected_sender_id="alice"\n            )'
    )

    with open(py_file, 'w', encoding='utf-8') as f:
        f.write(content)
