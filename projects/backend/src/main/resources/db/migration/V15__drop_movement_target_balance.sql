-- A correction's broker figure lives on its morning (`account_reconciliation.broker_balance`) since
-- #476 : this column only duplicated it, and the endpoint that gave it a meaning of its own is gone
-- (#479). Its CHECK goes with it.
ALTER TABLE account_movement DROP CONSTRAINT account_movement_target_type_check;
ALTER TABLE account_movement DROP COLUMN target_balance;
