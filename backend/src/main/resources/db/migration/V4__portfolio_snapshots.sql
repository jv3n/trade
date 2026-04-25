-- V4: Portfolio snapshots — historique des positions à chaque import CSV

CREATE TABLE portfolio_snapshot (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id    UUID        NOT NULL,                              -- regroupe les snapshots du même import
    portfolio_id UUID       NOT NULL REFERENCES portfolio(id) ON DELETE CASCADE,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE snapshot_position (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id      UUID          NOT NULL REFERENCES portfolio_snapshot(id) ON DELETE CASCADE,
    ticker           VARCHAR(20)   NOT NULL,
    name             TEXT          NOT NULL,
    asset_type       VARCHAR(50)   NOT NULL,
    quantity         NUMERIC(18,6) NOT NULL,
    book_value_cad   NUMERIC(18,2) NOT NULL,   -- Valeur comptable (CAD), toujours en CAD
    market_value     NUMERIC(18,4) NOT NULL,   -- Valeur marchande (devise native)
    market_currency  VARCHAR(10)   NOT NULL,
    unrealized_gain  NUMERIC(18,4),            -- Rendements non réalisés du marché
    gain_currency    VARCHAR(10)
);

CREATE INDEX idx_snapshot_imported  ON portfolio_snapshot(imported_at DESC);
CREATE INDEX idx_snapshot_batch     ON portfolio_snapshot(batch_id);
CREATE INDEX idx_snapshot_portfolio ON portfolio_snapshot(portfolio_id, imported_at DESC);
