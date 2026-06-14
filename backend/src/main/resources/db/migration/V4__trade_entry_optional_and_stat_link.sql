-- Post-pivot journal relaxation + optional stat link.
--
-- 1. Only trade_date + ticker stay mandatory. play / pattern / size / open_price become optional so
--    a trade can be jotted down fast and fleshed out later. The existing CHECK constraints
--    (size > 0, open_price > 0) stay as-is: a CHECK passes when its expression is NULL, so dropping
--    NOT NULL is enough — a null size/open_price no longer violates them.
-- 2. stat_entry_id is a nullable link to the matching imported stat row. NULL = "orphan" trade
--    (no stat attached yet). ON DELETE SET NULL so deleting a stat re-orphans the trades instead of
--    cascading. The link is assigned later from the UI (combobox) — there is no implicit
--    (date, ticker) match, hence a plain surrogate-id FK rather than a composite one.

ALTER TABLE trade_entry
    ALTER COLUMN play       DROP NOT NULL,
    ALTER COLUMN pattern    DROP NOT NULL,
    ALTER COLUMN size       DROP NOT NULL,
    ALTER COLUMN open_price DROP NOT NULL;

ALTER TABLE trade_entry
    ADD COLUMN stat_entry_id UUID NULL REFERENCES stat_entry(id) ON DELETE SET NULL;

CREATE INDEX idx_trade_entry_stat_entry_id   ON trade_entry(stat_entry_id);
CREATE INDEX idx_trade_entry_user_date_ticker ON trade_entry(user_id, trade_date, ticker);
