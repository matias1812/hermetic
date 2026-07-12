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
| 2 | `kem_algorithm` | Varies | Cryptographic identifier (`ML-KEM-1024`). |
| 3 | `aead_algorithm` | Varies | Cryptographic identifier (`AES-256-GCM`). |
| 4 | `signature_algorithm` | Varies | Cryptographic identifier (`SLH-DSA-SHA2-128f`). |
| 5 | `sender_id` | ≤ 256 bytes | Identity of the sender. |
| 6 | `receiver_id` | ≤ 256 bytes | Identity of the recipient. |
| 7 | `timestamp` | 8 bytes | Big-endian 64-bit UNIX epoch timestamp. |
| 8 | `kem_ciphertext` | 1568 bytes | Exact match for ML-KEM-1024 ciphertext. |
| 9 | `aes_nonce` | 12 bytes | Exact AES-256-GCM nonce size. |
| 10| `ciphertext` | ≤ 10,485,760 bytes | Maximum 10MB application payload limit. |

## 4. Cryptographic Policies & Signatures
The canonical envelope enforce strict usage of algorithms:
- **KEM_ALLOWED**: `{"ML-KEM-1024"}`
- **AEAD_ALLOWED**: `{"AES-256-GCM"}`
- **SIGNATURE_ALLOWED**: `{"SLH-DSA-SHA2-128f"}`
- **PROTOCOL_VERSION_ALLOWED**: `{1}`

**Signature Algorithm (Normative vs Implementation):**
- **Normative Identifier**: `SLH-DSA-SHA2-128f` (FIPS 205). This is the string included in the canonical payload.
- **Implementation Backend**: Depending on the specific library (`pqcrypto.sign.sphincs_sha2_128f_simple` or similar pre-standard versions), the backend must ensure parameters match:
  - Public Key length: 32 bytes
  - Signature length: 17088 bytes
- Implementation constraints: The signed payload verifies this exact canonical structure, ensuring interoperability between WASM, Python, and Rust.

## 5. Resource Limits
The total size of the canonical payload buffer must be calculated prior to memory allocation. If `total_size > 11 * 1024 * 1024` (11MB), the operation MUST abort with `InvalidEnvelopeError` before constructing the aggregated canonical payload and before invoking signature verification or ML-KEM decapsulation.
