-- Stats reworked (#187) : a stat is born from a candidate (its premarket data is copied) and is
-- completed after the 4 pm close with the session prices. The database restarts empty for the
-- redesign, so the table is dropped and recreated — no data migration.
--
-- Gone : the RADAR / MANUAL / IMPORT source (a stat now always belongs to its user), the global
-- community dataset (created_by IS NULL), institutions % and "> 20 % institutions" (filtered
-- upstream : a ticker held by institutions never becomes a candidate), and the stored percentages
-- (push / LOD / EOD) — every percentage is derived from the prices.
--
-- New : the pattern, the premarket block copied from the candidate, `push_open_price` (the price
-- reached by the push that follows the open), `high_price` renamed `hod_price`, and the link back
-- to the source candidate.
--
-- DROP ... CASCADE also drops the FK `trade_entry.stat_entry_id` -> `stat_entry(id)` ; the column
-- stays and the constraint is recreated below.

DROP TABLE stat_entry CASCADE;

CREATE TABLE stat_entry (
    id                UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID            NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    -- Source candidate. Kept as a trace ; deleting the candidate leaves the stat untouched.
    candidate_id      UUID            REFERENCES candidate(id) ON DELETE SET NULL,
    trade_date        DATE            NOT NULL,
    pattern           pattern         NOT NULL DEFAULT 'GUS',
    ticker            VARCHAR(20)     NOT NULL,

    -- ---- Premarket, copied from the candidate ----
    previous_close    NUMERIC(18, 4)  NOT NULL CHECK (previous_close > 0),
    pm_open           NUMERIC(18, 4)  NOT NULL CHECK (pm_open > 0),
    pm_high           NUMERIC(18, 4)  NOT NULL CHECK (pm_high > 0),
    float_millions    NUMERIC(12, 2)  CHECK (float_millions >= 0),
    volume_millions   NUMERIC(12, 2)  CHECK (volume_millions >= 0),
    locate_per_share  NUMERIC(10, 4)  CHECK (locate_per_share >= 0),
    note              VARCHAR(2000),

    -- ---- Session, entered at the 4 pm close. All null while the stat is "to complete" ----
    open_price        NUMERIC(18, 4)  CHECK (open_price > 0),
    push_open_price   NUMERIC(18, 4)  CHECK (push_open_price > 0),
    hod_price         NUMERIC(18, 4)  CHECK (hod_price > 0),
    lod_price         NUMERIC(18, 4)  CHECK (lod_price > 0),
    eod_price         NUMERIC(18, 4)  CHECK (eod_price > 0),

    -- ---- Flags of the session ----
    ssr               BOOLEAN         NOT NULL DEFAULT FALSE,
    under_1_dollar    BOOLEAN         NOT NULL DEFAULT FALSE,
    entry_after_11am  BOOLEAN         NOT NULL DEFAULT FALSE,

    created_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
    CONSTRAINT ux_stat_entry_user_day_ticker UNIQUE (user_id, trade_date, ticker)
);

-- Listing : a user's stats, newest day first.
CREATE INDEX idx_stat_entry_user_date ON stat_entry (user_id, trade_date DESC);
CREATE INDEX idx_stat_entry_candidate ON stat_entry (candidate_id);

-- The old stats are gone with the table above, so the trades that pointed at one are now orphans :
-- clear the column before recreating the FK, otherwise the constraint is rejected on the spot.
UPDATE trade_entry SET stat_entry_id = NULL WHERE stat_entry_id IS NOT NULL;

-- Recreated after the CASCADE above : a trade points back at the stat it was created from.
ALTER TABLE trade_entry
    ADD CONSTRAINT fk_trade_entry_stat_entry
        FOREIGN KEY (stat_entry_id) REFERENCES stat_entry(id) ON DELETE SET NULL;
