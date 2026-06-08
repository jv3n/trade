-- V6__stat_entry.sql — Trade-stats table (phase 2 stats import, cf. docs/projet/roadmap.md).
--
-- Distinct from `trade_entry` (the execution journal). One row per observed setup, focused on
-- pre-trade context (gap, float, institutional ownership, restrictions) + intraday price levels.
-- Fed by a CSV import (POST /api/stats/import) ; layout owned by StatEntryCsvDecoder.
--
-- **Global, shared dataset** — unlike `trade_entry`, stats are NOT multi-tenant : there is no
-- `user_id`. The rows are a single shared dataset readable by every authenticated user ; only
-- ADMINs may mutate it (the CSV import is gated by `hasRole("ADMIN")` on POST /api/stats/** in
-- SecurityConfig). Most frequent read = "all rows, most recent first" → index on (trade_date DESC).
--
-- Two logical sections of *input* columns (all manually entered in the source CSV) :
--   (1) Setup     — gap_up_percent, float_shares_millions, institutions_percent + boolean flags
--   (2) Levels    — open_price, high_price, lod_price, eod_price
--
-- Plus three *derived* columns computed at insert time (StatMetrics), value ×100 encoding :
--   push_percent = (high - open) / open * 100
--   lod_percent  = (lod  - open) / open * 100
--   eod_percent  = (eod  - open) / open * 100
--
-- No Postgres ENUMs here (unlike trade_entry) — this table is all numeric / boolean, no
-- categorical fields.

CREATE TABLE stat_entry (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    trade_date              DATE            NOT NULL,
    ticker                  VARCHAR(20)     NOT NULL,

    -- Setup (manually entered) — percentages use value encoding (52.00 = 52%), float in millions.
    gap_up_percent          NUMERIC(8, 2)   NOT NULL,
    float_shares_millions   NUMERIC(12, 2)  NOT NULL CHECK (float_shares_millions > 0),
    institutions_percent    NUMERIC(5, 2)   NOT NULL CHECK (institutions_percent >= 0),
    inst_over_20            BOOLEAN         NOT NULL,
    under_1_dollar          BOOLEAN         NOT NULL,
    ssr                     BOOLEAN         NOT NULL,
    entry_after_11am        BOOLEAN         NOT NULL,
    note                    VARCHAR(2000),

    -- Price levels (manually entered)
    open_price              NUMERIC(18, 4)  NOT NULL CHECK (open_price > 0),
    high_price              NUMERIC(18, 4)  NOT NULL CHECK (high_price > 0),
    lod_price               NUMERIC(18, 4)  NOT NULL CHECK (lod_price > 0),
    eod_price               NUMERIC(18, 4)  NOT NULL CHECK (eod_price > 0),

    -- Derived at insert (value ×100, 2 decimals). Can be negative (price below open).
    push_percent            NUMERIC(8, 2)   NOT NULL,
    lod_percent             NUMERIC(8, 2)   NOT NULL,
    eod_percent             NUMERIC(8, 2)   NOT NULL,

    -- Audit
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX idx_stat_entry_trade_date ON stat_entry(trade_date DESC);
CREATE INDEX idx_stat_entry_ticker     ON stat_entry(ticker);

-- Bump `updated_at` on every UPDATE — same pattern as trade_entry, guarantees the invariant even
-- if a future code path bypasses JPA.
CREATE OR REPLACE FUNCTION stat_entry_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stat_entry_set_updated_at
BEFORE UPDATE ON stat_entry
FOR EACH ROW EXECUTE FUNCTION stat_entry_touch_updated_at();
