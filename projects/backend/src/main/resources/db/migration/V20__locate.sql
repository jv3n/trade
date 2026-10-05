-- Shares located before a short (#602) — paid whether or not the trade happens, so a locate stands
-- on its own : no link to the journal, and the candidate it came from is optional. Short only by
-- construction. Its cost is shares × price_per_share, derived, never stored. Several per (day,
-- ticker) are normal (a top-up), so no unique key there.
CREATE TABLE locate (
    id              UUID           PRIMARY KEY,
    user_id         UUID           NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    trading_date    DATE           NOT NULL,
    ticker          VARCHAR(20)    NOT NULL,
    shares          INTEGER        NOT NULL CONSTRAINT ck_locate_shares_positive CHECK (shares > 0),
    price_per_share NUMERIC(10, 4) NOT NULL CONSTRAINT ck_locate_price_non_negative CHECK (price_per_share >= 0),
    note            VARCHAR(2000),
    -- The date and ticker live on the locate : a detached one must still say what the money was for.
    candidate_id    UUID           REFERENCES candidate (id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ    NOT NULL,
    updated_at      TIMESTAMPTZ    NOT NULL
);

CREATE INDEX ix_locate_user_date ON locate (user_id, trading_date);
CREATE INDEX ix_locate_candidate ON locate (candidate_id);
