-- A locate reaches the account as its own read-only line (#606), the way a trade's P&L does : linked
-- to its locate, and labelled with its ticker, shares and candidate without reading the locate's
-- table. The ticker gets its own column rather than the free-text note : the « paid for nothing »
-- figure matches on it.
ALTER TABLE account_movement
    ADD COLUMN locate_id           UUID REFERENCES locate (id) ON DELETE CASCADE,
    ADD COLUMN locate_ticker       VARCHAR(20),
    ADD COLUMN locate_shares       INTEGER,
    ADD COLUMN locate_candidate_id UUID REFERENCES candidate (id) ON DELETE SET NULL;

ALTER TABLE account_movement
    ADD CONSTRAINT account_movement_locate_link_check
        CHECK ((type = 'LOCATE') = (locate_id IS NOT NULL)),
    ADD CONSTRAINT account_movement_locate_ticker_check
        CHECK ((type = 'LOCATE') = (locate_ticker IS NOT NULL)),
    ADD CONSTRAINT account_movement_locate_shares_check
        CHECK ((type = 'LOCATE') = (locate_shares IS NOT NULL)),
    ADD CONSTRAINT account_movement_locate_candidate_requires_locate
        CHECK (locate_candidate_id IS NULL OR type = 'LOCATE'),
    ADD CONSTRAINT account_movement_locate_is_expense
        CHECK (type <> 'LOCATE' OR amount < 0);

CREATE UNIQUE INDEX ux_account_movement_locate ON account_movement (locate_id) WHERE locate_id IS NOT NULL;
