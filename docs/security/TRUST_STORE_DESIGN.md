# Trust Store Design (Draft)

## Context
Currently, Herméticos FFI verifies the SPHINCS+ signature by accepting an arbitrary `sender_sphincs_pk` provided at runtime. This poses a vulnerability where an attacker can supply their own key alongside a forged identity (`sender_id`).

## Objective
Implement a `TrustStore` that binds `sender_id` uniquely to an authorized Public Key, removing the parameter from the verification API surface entirely.

## Open Questions & Required Future Work
- **Storage Strategy**: Should the trust store be resident in memory, read from a secure hardware enclave, or fetched from a validated database table on boot?
- **Key Rotation**: How will Herméticos handle revoked or rotated sender keys?
- **Initial Provisioning**: How is the first trusted key injected into the node?

## Next Steps
This design is **pending implementation** in the next phase of identity hardening.
