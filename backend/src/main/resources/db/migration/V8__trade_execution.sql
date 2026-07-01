-- Multi-execution positions (issue #93).
--
-- A journal row stops being a single flat trade : it becomes a *position* built from an ordered list
-- of executions (entries + exits), each with its own share count and price. The flat columns
-- (size / open_price / exit_price / profit_dollars / gain_percent) survive but become **derived
-- aggregates** recomputed by the backend (TradePositionCalculator) on every write — they stay as
-- columns so the listing sort/filter, the CSV export and the account event keep reading flat values.
--
-- 1. New enums : trade_direction (BUY / SHORT) and execution_kind (ENTRY / EXIT).
-- 2. trade_entry gains a nullable `direction` (null until the first execution is recorded).
-- 3. New child table trade_execution, one row per fill, cascade-deleted with its parent.
-- 4. Backfill : every legacy row with size + open_price becomes a single ENTRY execution (+ an EXIT
--    when exit_price is set), and gets a short-biased inferred direction. Incomplete rows (no
--    size / open_price) stay without executions and keep a null direction. Existing
--    profit_dollars / gain_percent are left untouched — they already reflect the single in/out and
--    will be recomputed the next time the row is edited through the service.

CREATE TYPE trade_direction AS ENUM ('BUY', 'SHORT');
CREATE TYPE execution_kind AS ENUM ('ENTRY', 'EXIT');

ALTER TABLE trade_entry
    ADD COLUMN direction trade_direction;

CREATE TABLE trade_execution (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_entry_id UUID          NOT NULL REFERENCES trade_entry(id) ON DELETE CASCADE,
    seq            INTEGER       NOT NULL,
    kind           execution_kind NOT NULL,
    shares         INTEGER       NOT NULL CHECK (shares > 0),
    price          NUMERIC(18, 4) NOT NULL CHECK (price > 0),
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (trade_entry_id, seq)
);

CREATE INDEX idx_trade_execution_entry ON trade_execution(trade_entry_id);

-- Backfill direction (short-biased) on rows that carry a real position.
UPDATE trade_entry
SET direction = CASE
        WHEN exit_price IS NULL          THEN 'SHORT'::trade_direction
        WHEN exit_price <= open_price    THEN 'SHORT'::trade_direction
        ELSE 'BUY'::trade_direction
    END
WHERE size IS NOT NULL
  AND open_price IS NOT NULL;

-- Backfill the ENTRY execution (seq 0) for every legacy position.
INSERT INTO trade_execution (trade_entry_id, seq, kind, shares, price)
SELECT id, 0, 'ENTRY'::execution_kind, size, open_price
FROM trade_entry
WHERE size IS NOT NULL
  AND open_price IS NOT NULL;

-- Backfill the EXIT execution (seq 1) for legacy positions that were closed.
INSERT INTO trade_execution (trade_entry_id, seq, kind, shares, price)
SELECT id, 1, 'EXIT'::execution_kind, size, exit_price
FROM trade_entry
WHERE size IS NOT NULL
  AND open_price IS NOT NULL
  AND exit_price IS NOT NULL;
