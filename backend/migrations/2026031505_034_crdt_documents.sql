-- Migration 034: CRDT Real-time Collaboration Documents
-- Task 19: Universal CRDT-based Real-time Collaboration (Enterprise)
--
-- Stores binary CRDT state (Yrs/Yjs) for collaborative documents.
-- Each document is uniquely identified by (app_id, doc_key).
-- The crdt_state column holds the full Yrs state vector as BYTEA.

CREATE TABLE IF NOT EXISTS ch_crdt_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id          TEXT NOT NULL,
    doc_key         TEXT NOT NULL,
    crdt_state      BYTEA NOT NULL DEFAULT '\x'::bytea,
    version         BIGINT NOT NULL DEFAULT 0,
    active_peers    INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Each (app_id, doc_key) pair is unique
    CONSTRAINT ch_crdt_documents_unique_key UNIQUE (app_id, doc_key)
);

-- Index for GC queries: find large documents with no active peers
CREATE INDEX IF NOT EXISTS idx_ch_crdt_documents_gc
    ON ch_crdt_documents (active_peers, octet_length(crdt_state) DESC)
    WHERE active_peers = 0;

-- Index for listing documents by app
CREATE INDEX IF NOT EXISTS idx_ch_crdt_documents_app
    ON ch_crdt_documents (app_id, updated_at DESC);

COMMENT ON TABLE ch_crdt_documents IS 'CRDT document storage for real-time collaboration (Yrs/Yjs binary state)';
COMMENT ON COLUMN ch_crdt_documents.crdt_state IS 'Binary Yrs state vector — contains full CRDT history for conflict-free merge';
COMMENT ON COLUMN ch_crdt_documents.version IS 'Monotonically increasing version counter — incremented on each save';
COMMENT ON COLUMN ch_crdt_documents.active_peers IS 'Number of currently connected WebSocket peers — 0 means document is idle';
