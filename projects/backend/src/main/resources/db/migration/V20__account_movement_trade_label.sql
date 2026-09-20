-- The account page labels a TRADE line "KTTA short 350" (mockup/compte.html). Only the ticker was
-- stored, in `note`. Direction and size are copied onto the movement at sync time rather than
-- joined from `trade_entry` on read : the account context reaches the journal through
-- `TradeChangedEvent`, never by reading its tables.
--
-- Structured columns, not a pre-formatted string : "short" is a user-facing word the frontend
-- translates (FR / EN), so it must not be frozen in the database.
--
-- Both nullable : only TRADE movements carry them, and a trade has no direction until its first
-- execution is recorded.
ALTER TABLE account_movement
    ADD COLUMN trade_direction trade_direction,
    ADD COLUMN trade_size      INTEGER;

ALTER TABLE account_movement
    ADD CONSTRAINT account_movement_trade_label_requires_trade
        CHECK ((trade_direction IS NULL AND trade_size IS NULL) OR type = 'TRADE');
