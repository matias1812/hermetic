CREATE TABLE IF NOT EXISTS hermes_schema_version (
    component VARCHAR(64) PRIMARY KEY,
    version INTEGER NOT NULL
);

INSERT INTO hermes_schema_version (component, version)
VALUES ('replay_registry', 1)
ON CONFLICT (component) DO UPDATE SET version = EXCLUDED.version;

CREATE TABLE IF NOT EXISTS replay_claims (
    replay_domain VARCHAR(32) NOT NULL,
    signature_hash BYTEA NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending', 'consumed', 'rejected')),
    claim_token BYTEA NULL,
    registered_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,

    PRIMARY KEY (replay_domain, signature_hash)
);

CREATE INDEX IF NOT EXISTS idx_replay_expires_at ON replay_claims (expires_at);
