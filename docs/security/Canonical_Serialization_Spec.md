# Canonical Serialization Specification

This document defines the exact deterministic serialization format used to construct the signed payload in the `canonical_signed_payload` function.

## 1. Domain Separator
Every signed payload MUST begin with the exact domain separator:
`b"HERMES-ENVELOPE-SIGNATURE\x00"`

## 2. Field Encoding
Each subsequent field is appended sequentially using the following deterministic encoding (`_encode_field`):
```
[ name_length (2 bytes, big-endian) ]
[ name (UTF-8 bytes) ]
[ value_length (8 bytes, big-endian) ]
[ value (bytes) ]
```

## 3. Ordered Field Definitions
The fields MUST be appended in the following exact order. The `name` strings are strictly lowercase ASCII.

| Order | Field Name | Allowed Lengths | Description |
|-------|------------|-----------------|-------------|
| 1 | `version` | 1 byte | Protocol version (`b"\x01"`). |
| 2 | `kem_algorithm` | 11 bytes | Cryptographic identifier. Must be exactly `ML-KEM-1024`. |
| 3 | `aead_algorithm` | 11 bytes | Cryptographic identifier. Must be exactly `AES-256-GCM`. |
| 4 | `signature_algorithm` | 18 bytes | Cryptographic identifier. Must be exactly `SLH-DSA-SHAKE-128f`. Note: the underlying pre-standard implementation backend used is `pqcrypto.sign.sphincs_shake_128f_simple`. |
| 5 | `sender_id` | ≤ 256 bytes | Identity of the sender. |
| 6 | `receiver_id` | ≤ 256 bytes | Identity of the recipient. |
| 7 | `timestamp` | 8 bytes | Big-endian 64-bit UNIX epoch timestamp. |
| 8 | `kem_ciphertext` | 1568 bytes | Exact match for ML-KEM-1024 ciphertext. |
| 9 | `aes_nonce` | 12 bytes | Exact AES-256-GCM nonce size. |
| 10 | `ciphertext` | ≤ 10,485,760 bytes | Maximum 10MB application payload limit. |

## 4. Resource Limits
The total size of the canonical payload buffer must be calculated prior to memory allocation. If `total_size > 11 * 1024 * 1024` (11MB), the operation MUST abort with `InvalidEnvelopeError`.
