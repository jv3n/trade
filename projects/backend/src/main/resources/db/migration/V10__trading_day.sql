-- « Nothing today » marks of the Today page (#407), one row per user and day. A null timestamp is
-- no mark ; the row is removed once both are cleared, so a stored row always says something.
CREATE TABLE trading_day (
    id                UUID        PRIMARY KEY,
    user_id           UUID        NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    trading_date      DATE        NOT NULL,
    no_candidate_at   TIMESTAMPTZ,
    no_trade_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL,
    updated_at        TIMESTAMPTZ NOT NULL,
    CONSTRAINT ux_trading_day_user_date UNIQUE (user_id, trading_date)
);
