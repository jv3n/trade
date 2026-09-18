-- Screenshot attachment on a journal entry (issue #110, Phase B).
--
-- A single, optional screenshot per position, stored as bytea in a dedicated child table so the
-- image bytes are NEVER loaded by the listing queries (they never join trade_attachment). The
-- `has_screenshot` flag is denormalized onto trade_entry and maintained by the service — the DTO
-- exposes it without a join (zero N+1 on the paginated list). The screenshot is a separate binary
-- flow : it is intentionally out of the CSV import/export.
--
-- One image per trade for now (UNIQUE trade_entry_id) ; dropping the UNIQUE later is all it takes to
-- allow several.

ALTER TABLE trade_entry ADD COLUMN has_screenshot BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE trade_attachment (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_entry_id UUID          NOT NULL UNIQUE REFERENCES trade_entry(id) ON DELETE CASCADE,
    content        BYTEA         NOT NULL,
    content_type   VARCHAR(100)  NOT NULL,
    filename       VARCHAR(255),
    size_bytes     INTEGER       NOT NULL CHECK (size_bytes > 0),
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);
