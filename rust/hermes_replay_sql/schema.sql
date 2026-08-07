CREATE TABLE IF NOT EXISTS hermes_schema_version (
    component VARCHAR(64) PRIMARY KEY,
    version INTEGER NOT NULL
);

INSERT INTO hermes_schema_version (component, version)
VALUES ('replay_registry', 1)
ON DUPLICATE KEY UPDATE version = version;

CREATE TABLE IF NOT EXISTS replay_claims (
    replay_domain VARCHAR(32) NOT NULL,
    signature_hash BINARY(32) NOT NULL,
    state ENUM('pending', 'consumed', 'rejected') NOT NULL,
    claim_token BINARY(16) NULL,
    registered_at BIGINT UNSIGNED NOT NULL,
    expires_at BIGINT UNSIGNED NOT NULL,

    PRIMARY KEY (replay_domain, signature_hash),
    INDEX idx_replay_expires_at (expires_at)
);
