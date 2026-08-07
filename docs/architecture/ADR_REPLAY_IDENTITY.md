# Architecture Decision Record: Replay and Identity

## Context
The system required a robust replay cache mechanism using tokens to safely handle concurrent decryption logic (avoiding TOCTOU vulnerabilities), as well as a strict identity registry to enforce sender authenticity. 
Recently, the architecture expanded to support multi-domain replay prevention to separate API authentication, E2E envelopes, and Relay nonces.

## Decisions

### 1. Multi-Domain Replay Separation
Replay storage has been segregated into immutable, backend-controlled domains:
- `HERMES-REPLAY-ENVELOPE-V1`: For E2E message envelopes.
- `HERMES-REPLAY-API-AUTH-V1`: For API endpoint authentication signatures.
- `HERMES-REPLAY-RELAY-V1`: For blind relay nonces.

**Security Rule:** The domain must NEVER be controlled or derived from client inputs (e.g., HTTP headers or JSON payload). It is statically hardcoded in backend methods.

### 2. TTL and Freshness Alignment
The TTL for each domain is mathematically aligned with its specific threat model:

#### API Authentication and Envelopes
- `API_AUTH_FRESHNESS_SECONDS = 300`
- `API_AUTH_RETENTION_SECONDS = 300`
Since API signatures enforce a strict 300-second timestamp freshness window, retaining the hash for 300 seconds is sufficient. After 300 seconds, the timestamp freshness check will naturally reject any replay attempts, making longer retention redundant.

#### Blind Relay Nonces
Para el webhook de relevo de mensajes cifrados (`/api/relay`), se implementa el modelo de **"Nueva firma por cada intento"**:
- **Frescura de Autenticación (`API_AUTH_FRESHNESS_SECONDS`):** 300 segundos. El timestamp de la cabecera HTTP y la firma SPHINCS+ asociada deben generarse de nuevo por cada intento de retransmisión.
- **Retención del Nonce (`RELAY_REPLAY_RETENTION_SECONDS`):** 86400 segundos (24 horas). El identificador del payload (`relay_nonce`) se estabiliza. Una vez que el nodo acepta el mensaje en su cola RAM local, realiza un `commit` sobre el nonce por 24h para evitar la entrega duplicada.
- **Pérdida ante reinicio:** Si el servidor se reinicia *después* de un `commit` pero antes de entregarlo, el mensaje efímero en RAM se pierde pero el nonce en SQL sigue marcado como consumido. Ante esta pérdida, se prioriza conservar la protección anti-replay sacrificando la reentrega (comportamiento deliberadamente **fail-closed respecto al replay**). No es puramente "fail-secure", pues se sacrifica disponibilidad de entrega intencionalmente.

### 3. Commit Semantics and Idempotency
- **"Consume Before Effect" (API Auth):** For API endpoints, the signature is claimed and committed *before* the endpoint's business logic is executed. This ensures a signature is strictly single-use per attempt.
- **Idempotency:** Replay protection (preventing reuse of the same authorization) is distinct from Idempotency (preventing reuse of the same business effect). Endpoints with side effects (like `/api/backup` or `/api/clear`) must rely on a separate, signed `operation_id` for idempotency if retries are expected, as a transient failure will invalidate the authentication signature but leave the business effect unknown to the client.

### 4. Replay Cache States
The replay cache (`ReplayRegistry`) enforces three distinct states:
- **Missing**: The key hash is not known (or has expired). A `claim` transitions it to `Pending`.
- **Pending**: The hash has been claimed and a strictly 16-byte `claim_token` has been issued.
- **Consumed**: A `commit` operation finalized the usage (Successful decryption).
- **Rejected**: A `reject` operation flagged the message as definitively invalid (e.g. invalid AES nonce or KEM length).

### 5. Failure Handling & Fallback
- **Deterministic Cryptographic Failures**: (e.g. invalid tag, incorrect lengths) transition to `Rejected` via `reject`.
- **Transient Internal Failures**: (e.g. database timeout prior to state commitment) trigger a `Release`, purging the `Pending` state.
- **Unknown Failures & Commit Failures**: Any unknown exception or a failure in the `commit` itself will **Fail-Closed**. The state is left in `Pending`, blocking future replays until the TTL expires.

### 6. Legacy Migration
La migración desde la tabla de hashes heredada hacia `replay_claims` está oficialmente **finalizada** y todo el código viejo DAO y SQL fue erradicado del proyecto en un solo commit atómico (v4).
