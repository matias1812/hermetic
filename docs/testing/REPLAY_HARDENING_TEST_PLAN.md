# Test Plan: Replay & Hardening

## 1. Execution Matrix
This matrix defines the exact commands to run the verifications across the different environments.

| Test | Command | Evidence Artifact |
|---|---|---|
| Python ABA concurrency | `pytest -q tests/security/test_otp_registry_python.py::test_aba` | pytest output |
| Rust replay transitions | `cargo test replay_registry -- --nocapture` | cargo output |
| Wheel import | `python -c "import hermes_ffi; print(hermes_ffi.__file__)"` | absolute `.pyd` path |
| FastAPI integration | `pytest -q tests/integration/test_replay_api.py` | HTTP assertions |
| Chaos Verifier | `python scripts/chaos_verifier.py` | Verifier logs |

## 2. Concurrency and Replay State (ABA)
| Test Case | Expected Result | Backend |
|-----------|----------------|---------|
| Two concurrent requests for the same hash | One succeeds (`Pending`), other fails. | Python & Rust |
| `release` with incorrect token | `InvalidClaimTokenError` (No state change). | Python & Rust |
| `commit` with incorrect token | `InvalidClaimTokenError` (No state change). | Python & Rust |
| `reject` with incorrect token | `InvalidClaimTokenError` (No state change). | Python & Rust |
| `release` against `Consumed` or `Rejected` | `InvalidReplayTransitionError` (No state change). | Python & Rust |
| Claim expired and reclaimed by another thread | First claim purged, second claim returns new `Pending` token. | Python & Rust |
| Old operation attempts `commit` after new claim | Fails with `InvalidClaimTokenError` (token mismatch). | Python & Rust |

## 3. Hardening Transitions
| Test Case | State Transition | Expected Result |
|-----------|----------------|---------|
| Timestamp `now - 301` | `Missing` -> `Missing` | Rejected pre-cache, TTL expired |
| Timestamp `now - 300` | `Missing` -> `Pending` -> `Consumed` | Succeeds (Edge of window) |
| Timestamp `now + 60` | `Missing` -> `Pending` -> `Consumed` | Succeeds (Edge of future window) |
| Timestamp `now + 61` | `Missing` -> `Missing` | Rejected pre-cache, too far in future |
| Invalid AES-GCM Tag | `Missing` -> `Pending` -> `Rejected` | `InvalidEnvelopeError` |
| Invalid AES-256-GCM Nonce Length | `Missing` -> `Pending` -> `Rejected` | `InvalidNonceError` |
| Invalid ML-KEM-1024 Ciphertext Length | `Missing` -> `Pending` -> `Rejected` | `InvalidKemCiphertextError` |
| Altering individual signed fields | `Missing` -> `Pending` -> `Rejected` | `InvalidEnvelopeError` (Signature fails) |
| Known Transient Network Error | `Missing` -> `Pending` -> `Missing` | Retry is permitted (`release`). |
| Unhandled Exception / Commit Failure | `Missing` -> `Pending` -> `Pending` | Token frozen. Next requests rejected until TTL expires. |

## 4. Capacity & Memory Limits
| Test Case | Expected Result |
|-----------|----------------|
| `sender_id` > 256 bytes | Fails with `InvalidEnvelopeError` before aggregating the payload buffer. |
| Total Payload > 11MB | Fails with `InvalidEnvelopeError` before aggregating the payload buffer. |
| `MAX_ENTRIES - 1` | `Pending` claim succeeds. |
| `MAX_ENTRIES` | `Pending` claim succeeds. |
| `MAX_ENTRIES + 1` | `RegistryCapacityError` raised and `claim` fails, assuming pruning has already run. |
