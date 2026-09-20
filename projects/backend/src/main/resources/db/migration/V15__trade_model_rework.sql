-- Trade model reworked (#192) : a trade is born from a stat, inherits its pattern and context, and
-- only carries executions, post-mortem, screenshot and an adjustable P&L.
--
-- The database restarts empty for the redesign, so the columns are dropped outright — no data
-- migration, no backfill.
--
-- Gone : the play A / B, the 5 pre-trade checklist booleans, the open side (front / back), the
-- "short on resistance" flag and the exit strategy. Their enums go with them, they have no other
-- user.
--
-- New : `real_profit_dollars`, the P&L read off the TradeZero statement. It overrides the P&L
-- computed from the executions (broker fees and rounding, a few cents to a few dollars). The
-- retained P&L — the one that reaches the account — is COALESCE(real, computed) ; it stays derived
-- rather than stored so the two sources can never drift.
--
-- Changed : `stat_entry_id` becomes mandatory (a trade is only ever created from a stat, cf.
-- PARCOURS étape 4) and its FK moves from ON DELETE SET NULL to ON DELETE RESTRICT — a stat that
-- carries a trade can no longer be deleted out from under it.
--
-- New on the executions : `executed_at`, the fill time read off the broker's statement. Nullable
-- (a fill can be jotted down without its time) ; the trade duration is derived from the first entry
-- and the last exit when both carry one.

ALTER TABLE trade_entry
    DROP COLUMN play,
    DROP COLUMN pre_9h35_to_10h,
    DROP COLUMN pre_gap_up_50,
    DROP COLUMN pre_price_1_to_10,
    DROP COLUMN pre_float_3_to_50m,
    DROP COLUMN pre_wait_push,
    DROP COLUMN open_side,
    DROP COLUMN short_on_resistance,
    DROP COLUMN exit_strategy;

DROP TYPE trade_play;
DROP TYPE trade_open_side;
DROP TYPE trade_exit_strategy;

ALTER TABLE trade_entry
    ADD COLUMN real_profit_dollars NUMERIC(18, 2);

-- Pre-#192 trades could live without a stat ("orphans"). Under the new model such a row has no
-- pattern, no context and no way to be recreated, so it is dropped rather than patched onto an
-- arbitrary stat — the database restarts empty for the redesign anyway. The account movements that
-- hang off these trades go with them (ON DELETE CASCADE on account_movement.trade_entry_id).
DELETE FROM trade_entry WHERE stat_entry_id IS NULL;

ALTER TABLE trade_entry
    DROP CONSTRAINT fk_trade_entry_stat_entry,
    ALTER COLUMN stat_entry_id SET NOT NULL;

ALTER TABLE trade_entry
    ADD CONSTRAINT fk_trade_entry_stat_entry
        FOREIGN KEY (stat_entry_id) REFERENCES stat_entry(id) ON DELETE RESTRICT;

ALTER TABLE trade_execution
    ADD COLUMN executed_at TIME;
