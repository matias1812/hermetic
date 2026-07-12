# Architecture Decision Record: Replay and Identity

## Context
The system required a robust replay cache mechanism using tokens to safely handle concurrent decryption logic (avoiding TOCTOU vulnerabilities), as well as a strict identity registry to enforce sender authenticity. 

## Decisions

### 1. Replay Cache States
The replay cache (`OTPKeyRegistry`) enforces three distinct states:
- **Missing**: The key hash is not known (or has expired). A `claim` transitions it to `Pending`.
- **Pending**: The hash has been claimed and a strictly 16-byte `claim_token` has been issued.
- **Consumed**: A `commit` operation finalized the usage (Successful decryption).
- **Rejected**: A `reject` operation flagged the message as definitively invalid (e.g. invalid AES nonce or KEM length).

### 2. State Transitions and Errors
Strict state transitions must be enforced. If the token is incorrect or the transition is invalid from the current state, the operation must not change the state and must return an explicit error.

**Valid Transitions:**
- `claim(hash)`: Missing → Pending(token)
- `commit(hash, correct_token)`: Pending → Consumed
- `reject(hash, correct_token)`: Pending → Rejected
- `release(hash, correct_token)`: Pending → Missing

**Invalid Transitions (Errors):**
- Invalid token provided: Throws `InvalidClaimTokenError` (No state change).
- `commit`/`reject`/`release` called on `Consumed` or `Rejected`: Throws `InvalidReplayTransitionError` (No state change).

### 3. Failure Handling & Fallback
- **Deterministic Cryptographic Failures**: (e.g. invalid tag, incorrect lengths) transition to `Rejected` via `reject`.
- **Transient Internal Failures**: (e.g. database timeout prior to state commitment) trigger a `Release`, purging the `Pending` state.
- **Unknown Failures & Commit Failures**: Any unknown exception or a failure in the `commit` itself will **Fail-Closed**. The state is left in `Pending`, blocking future replays until the TTL (300 seconds) expires.

### 4. Identity and Sender Validation
- `expected_sender_id` is now a mandatory parameter, enforced with `hmac.compare_digest` to prevent basic spoofing.
- The Trust Store must eventually replace dynamic arbitrary public keys.

### 4. Sizes and Algorithms
- Enforces strict KEM lengths: `ML-KEM-1024` ciphertext is exactly 1568 bytes.
- Enforces strict AEAD sizes: `AES-256-GCM` nonce is exactly 12 bytes.
- Algorithms are authenticated inside the payload canonical string.
