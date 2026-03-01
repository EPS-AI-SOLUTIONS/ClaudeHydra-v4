-- OCR history table for ClaudeHydra v4
-- Stores OCR results for history/search

CREATE TABLE IF NOT EXISTS ch_ocr_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename        TEXT,
    mime_type       TEXT NOT NULL,
    preset          TEXT,
    text            TEXT NOT NULL DEFAULT '',
    pages_json      JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_pages     INTEGER NOT NULL DEFAULT 1,
    confidence      DOUBLE PRECISION,
    provider        TEXT NOT NULL DEFAULT 'claude',
    processing_time_ms BIGINT NOT NULL DEFAULT 0,
    detected_preset TEXT,
    structured_data JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ch_ocr_history_created_at ON ch_ocr_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ch_ocr_history_filename ON ch_ocr_history (filename) WHERE filename IS NOT NULL;
