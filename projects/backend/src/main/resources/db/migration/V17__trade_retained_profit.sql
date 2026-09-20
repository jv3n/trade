-- Retained P&L as a generated column (issue #195).
--
-- The journal listing shows — and now sorts on — the **retained** P&L : the broker's real figure
-- when it has been typed in, the one computed from the executions otherwise. That rule already
-- lives in Kotlin (`TradeEntry.retainedProfit`), but a derived getter can't be sorted on by the
-- Criteria API, and a sort over a single page would be a lie on a paginated table.
--
-- A STORED generated column gives the sort (and any future SQL aggregate) a real column to work on
-- while making drift impossible : Postgres recomputes it from the very same two columns on every
-- write. It is read-only for the application — the entity maps it as non-insertable /
-- non-updatable and keeps the Kotlin getter as its read path.

ALTER TABLE trade_entry
  ADD COLUMN retained_profit_dollars NUMERIC(18, 2)
    GENERATED ALWAYS AS (COALESCE(real_profit_dollars, profit_dollars)) STORED;

-- The journal listing sorts on this column, filtered by user and date.
CREATE INDEX idx_trade_entry_retained_profit ON trade_entry (user_id, retained_profit_dollars);
