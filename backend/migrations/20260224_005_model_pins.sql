-- Model pinning — allows overriding auto-selected models per use case
CREATE TABLE IF NOT EXISTS ch_model_pins (
    use_case TEXT PRIMARY KEY,
    model_id TEXT NOT NULL,
    pinned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
