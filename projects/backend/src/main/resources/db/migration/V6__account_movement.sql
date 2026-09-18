-- Account module (pivot v1.0) : broker cash account, one implicit account per user (no `account`
-- table — scoped by user_id). The balance is derived (Σ amount), never stored.
--
-- `amount` is the SIGNED effect on the balance so balance = SUM(amount) is a plain sum :
--   DEPOSIT +, WITHDRAWAL −, TRADE ± (realized P&L pushed from the journal), ADJUSTMENT ± (manual
--   correction for broker fees / financing / slippage). CHECK (amount <> 0) keeps every row
--   meaningful — a zero deposit or a no-op correction is rejected upstream.
--
-- `trade_entry_id` links a TRADE movement back to its journal trade, ON DELETE CASCADE so removing
-- a trade removes its movement. The CHECK ties the link to the type : a row carries a
-- trade_entry_id IFF it is a TRADE (non-TRADE rows keep it NULL). The partial UNIQUE index enforces
-- one movement per trade. The TRADE wiring is consumed by the journal-integration slice.

CREATE TYPE account_movement_type AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'TRADE', 'ADJUSTMENT');

CREATE TABLE account_movement (
    id             UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID                   NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    type           account_movement_type  NOT NULL,
    amount         NUMERIC(18, 2)         NOT NULL CHECK (amount <> 0),
    value_date     DATE                   NOT NULL,
    note           VARCHAR(2000),
    trade_entry_id UUID                   REFERENCES trade_entry(id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ            NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ            NOT NULL DEFAULT now(),
    CONSTRAINT account_movement_trade_link_check
        CHECK ((type = 'TRADE') = (trade_entry_id IS NOT NULL))
);

CREATE INDEX idx_account_movement_user_date ON account_movement (user_id, value_date DESC);

CREATE UNIQUE INDEX ux_account_movement_trade
    ON account_movement (trade_entry_id)
    WHERE trade_entry_id IS NOT NULL;
