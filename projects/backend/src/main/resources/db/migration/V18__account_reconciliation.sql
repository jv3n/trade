-- Morning reconciliation (issue #198).
--
-- Every morning the app balance is checked against the balance TradeZero displays. A gap already
-- leaves a trace : the `ADJUSTMENT` movement carrying its `target_balance`. A **gap-free** morning
-- left none — so "reconciled today" was not a question the app could answer, and the history the
-- account page shows ("18/09 ✓ · 12/09 −12,40") had holes exactly on the good days.
--
-- One row per user per morning. `correction_id` points at the ADJUSTMENT when the morning needed
-- one ; deleting that movement later leaves the reconciliation in place (SET NULL) — it happened,
-- and the history says so.

CREATE TABLE account_reconciliation (
  id              UUID PRIMARY KEY,
  user_id         UUID           NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  value_date      DATE           NOT NULL,
  broker_balance  NUMERIC(18, 2) NOT NULL,
  app_balance     NUMERIC(18, 2) NOT NULL,
  -- Stored rather than derived : it is the gap **as it was that morning**, before the correction
  -- moved the balance. Recomputing it later would always yield zero.
  gap             NUMERIC(18, 2) NOT NULL,
  correction_id   UUID REFERENCES account_movement (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),

  -- One reconciliation per morning : reconciling twice the same day overwrites the row rather than
  -- stacking two lines for one decision.
  CONSTRAINT uq_account_reconciliation_day UNIQUE (user_id, value_date)
);

-- The history list and the "reconciled this morning ?" lookup both read the latest days first.
CREATE INDEX idx_account_reconciliation_user_date
  ON account_reconciliation (user_id, value_date DESC);
