-- Shares located before a short (#602) — paid whether or not the trade happens, so a locate stands
-- on its own : a cost on a (day, ticker), matched to the trades of that day by ticker, never by a
-- link (#625). Short only by construction. Its cost is shares × price_per_share, derived,
-- never stored. Several per (day, ticker) are normal (a top-up), so no unique key there.
CREATE TABLE locate (
    id              UUID           PRIMARY KEY,
    user_id         UUID           NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    trading_date    DATE           NOT NULL,
    ticker          VARCHAR(20)    NOT NULL,
    shares          INTEGER        NOT NULL CONSTRAINT ck_locate_shares_positive CHECK (shares > 0),
    price_per_share NUMERIC(10, 4) NOT NULL CONSTRAINT ck_locate_price_non_negative CHECK (price_per_share >= 0),
    -- The share's price when the locate was taken : the front weighs the locate against it.
    stock_price     NUMERIC(18, 4) CONSTRAINT ck_locate_stock_price_positive CHECK (stock_price > 0),
    note            VARCHAR(2000),
    created_at      TIMESTAMPTZ    NOT NULL,
    updated_at      TIMESTAMPTZ    NOT NULL
);

CREATE INDEX ix_locate_user_date ON locate (user_id, trading_date);

-- A locate reaches the account as its own read-only line, the way a trade's P&L does : linked to its
-- locate, and labelled with its ticker and shares without reading the locate's table.
-- The ticker gets its own column rather than the free-text note : the « paid for nothing » figure
-- matches on it.
ALTER TABLE account_movement
    ADD COLUMN locate_id           UUID REFERENCES locate (id) ON DELETE CASCADE,
    ADD COLUMN locate_ticker       VARCHAR(20),
    ADD COLUMN locate_shares       INTEGER;

ALTER TABLE account_movement
    ADD CONSTRAINT account_movement_locate_link_check
        CHECK ((type = 'LOCATE') = (locate_id IS NOT NULL)),
    ADD CONSTRAINT account_movement_locate_ticker_check
        CHECK ((type = 'LOCATE') = (locate_ticker IS NOT NULL)),
    ADD CONSTRAINT account_movement_locate_shares_check
        CHECK ((type = 'LOCATE') = (locate_shares IS NOT NULL)),
    ADD CONSTRAINT account_movement_locate_is_expense
        CHECK (type <> 'LOCATE' OR amount < 0);

CREATE UNIQUE INDEX ux_account_movement_locate ON account_movement (locate_id) WHERE locate_id IS NOT NULL;

-- A locate is a cost, not a measure of the setup (#625) : its quote leaves the candidate and the stat,
-- whose CHECKs go with the columns.
ALTER TABLE candidate DROP COLUMN locate_per_share;
ALTER TABLE stat_entry DROP COLUMN locate_per_share;
