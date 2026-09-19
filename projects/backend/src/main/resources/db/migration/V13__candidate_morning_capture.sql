-- Candidates reduced to the morning capture (#186) : only what is known in premarket, right after
-- the radar scan. The position-sizing cockpit (capital, risk %, stop, fill / entry / exit ladders,
-- morning push) is gone. The database restarts empty for the redesign, so the table is dropped and
-- recreated — no data migration.
--
-- Derived figures are never stored : gap % = (pm_open − previous_close) ÷ previous_close,
-- push % = (pm_high − pm_open) ÷ pm_open, locate / price = locate_per_share ÷ pm_open.
--
-- One candidate per (user, trading day, ticker) : a second capture of the same ticker on the same
-- day is a 409, not a duplicate row.

DROP TABLE candidate;

CREATE TABLE candidate (
    id                UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID            NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    trading_date      DATE            NOT NULL,
    pattern           pattern         NOT NULL DEFAULT 'GUS',
    ticker            VARCHAR(20)     NOT NULL,
    previous_close    NUMERIC(18, 4)  NOT NULL CHECK (previous_close > 0),
    pm_open           NUMERIC(18, 4)  NOT NULL CHECK (pm_open > 0),
    pm_high           NUMERIC(18, 4)  NOT NULL CHECK (pm_high > 0),
    -- Float and volume in millions of shares (8.2 = 8.2 M), as read on the radar / TradeZero.
    float_millions    NUMERIC(12, 2)  CHECK (float_millions >= 0),
    volume_millions   NUMERIC(12, 2)  CHECK (volume_millions >= 0),
    locate_per_share  NUMERIC(10, 4)  CHECK (locate_per_share >= 0),
    note              VARCHAR(2000),
    created_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
    CONSTRAINT ck_candidate_pm_high CHECK (pm_high >= pm_open),
    CONSTRAINT ux_candidate_user_day_ticker UNIQUE (user_id, trading_date, ticker)
);

-- The unique constraint's index also serves the day list (user_id, trading_date).
