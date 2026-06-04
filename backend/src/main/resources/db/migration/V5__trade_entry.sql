-- V5__trade_entry.sql — Trading journal table (v1.0 pivot, cf. docs/projet/roadmap.md).
--
-- One row per trade. Three logical sections :
--   (1) Identity  — user_id, trade_date, ticker
--   (2) Execution — play, pattern, size, open_price, exit_price, profit_dollars, gain_percent, note
--   (3) Preparation checklist — boolean flags + open_side + exit_strategy + error_note
--
-- Multi-tenant via user_id (ON DELETE CASCADE — delete user = clean their journal). Most
-- frequent query = "show me my entries ordered by date desc" → composite index on
-- (user_id, trade_date DESC).
--
-- Categorical fields use **Postgres ENUM types** rather than VARCHAR + CHECK (the convention
-- elsewhere in this DB). Trade-off : stricter at the DB layer, but adding a value (a new
-- pattern, a new play type) requires a Flyway migration with `ALTER TYPE … ADD VALUE`.
-- Acceptable here — the trade-pattern set is finite and curated by the user.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE trade_play AS ENUM ('A', 'B');
CREATE TYPE trade_pattern AS ENUM ('GUS', 'FRD');
CREATE TYPE trade_open_side AS ENUM ('FRONT', 'BACK');
CREATE TYPE trade_exit_strategy AS ENUM ('SWING_20', 'EOD');

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

CREATE TABLE trade_entry (
    id                  UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID                  NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,

    -- Identity
    trade_date          DATE                  NOT NULL,
    ticker              VARCHAR(20)           NOT NULL,

    -- Execution
    play                trade_play            NOT NULL,
    pattern             trade_pattern         NOT NULL,
    size                INTEGER               NOT NULL CHECK (size > 0),
    open_price          NUMERIC(18, 4)        NOT NULL CHECK (open_price > 0),
    exit_price          NUMERIC(18, 4)                 CHECK (exit_price IS NULL OR exit_price > 0),
    profit_dollars      NUMERIC(18, 2),
    gain_percent        NUMERIC(8, 4),
    note                VARCHAR(2000),

    -- Preparation checklist — all nullable so an entry can be created without ticking every box
    -- (e.g. a backfilled trade from yesterday where the user didn't track every criterion).
    pre_9h35_to_10h     BOOLEAN,
    pre_gap_up_50       BOOLEAN,
    pre_price_1_to_10   BOOLEAN,
    pre_float_3_to_50m  BOOLEAN,
    pre_wait_push       BOOLEAN,
    open_side           trade_open_side,
    short_on_resistance BOOLEAN,
    exit_strategy       trade_exit_strategy,
    error_note          VARCHAR(2000),

    -- Audit
    created_at          TIMESTAMPTZ           NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ           NOT NULL DEFAULT now()
);

CREATE INDEX idx_trade_entry_user_date ON trade_entry(user_id, trade_date DESC);
CREATE INDEX idx_trade_entry_ticker    ON trade_entry(ticker);

-- Trigger to bump `updated_at` on every UPDATE. Standard Postgres pattern — guarantees the
-- invariant even if a future code path bypasses JPA (e.g. a bulk SQL backfill).
CREATE OR REPLACE FUNCTION trade_entry_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trade_entry_set_updated_at
BEFORE UPDATE ON trade_entry
FOR EACH ROW EXECUTE FUNCTION trade_entry_touch_updated_at();
