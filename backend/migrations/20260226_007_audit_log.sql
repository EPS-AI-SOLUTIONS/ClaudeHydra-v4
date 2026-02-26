-- #40 Audit log for tracking important actions
CREATE TABLE IF NOT EXISTS ch_audit_log (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address VARCHAR(45)
);

CREATE INDEX IF NOT EXISTS idx_ch_audit_log_timestamp ON ch_audit_log(timestamp DESC);
