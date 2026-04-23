-- V1 : Schéma initial PortfolioAI

CREATE TABLE portfolio (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE asset (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id UUID NOT NULL REFERENCES portfolio(id) ON DELETE CASCADE,
    ticker       VARCHAR(20)  NOT NULL,
    name         VARCHAR(255) NOT NULL,
    quantity     NUMERIC(18, 6) NOT NULL,
    avg_buy_price NUMERIC(18, 4) NOT NULL,
    asset_type   VARCHAR(50)  NOT NULL, -- ETF, STOCK, COMMODITY, CRYPTO, BOND
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE recommendation (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id    UUID NOT NULL REFERENCES portfolio(id) ON DELETE CASCADE,
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    context_summary TEXT        NOT NULL, -- résumé du contexte macro injecté dans le prompt
    prompt_version  VARCHAR(50) NOT NULL DEFAULT 'v1',
    content         TEXT        NOT NULL, -- texte brut de la recommandation IA
    confidence      SMALLINT    CHECK (confidence BETWEEN 0 AND 100),
    status          VARCHAR(30) NOT NULL DEFAULT 'PENDING' -- PENDING, APPLIED, IGNORED, EVALUATED
);

CREATE TABLE recommendation_action (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID        NOT NULL REFERENCES recommendation(id) ON DELETE CASCADE,
    ticker            VARCHAR(20) NOT NULL,
    action            VARCHAR(10) NOT NULL, -- BUY, SELL, HOLD, REDUCE
    rationale         TEXT,
    target_weight     NUMERIC(5, 2) -- % cible dans le portefeuille
);

CREATE TABLE recommendation_score (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID        NOT NULL UNIQUE REFERENCES recommendation(id) ON DELETE CASCADE,
    evaluated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    directional_score NUMERIC(5, 2), -- % de bonnes directions prédites
    relative_perf     NUMERIC(8, 4), -- performance vs benchmark (ex: VOO)
    notes             TEXT
);

-- Index utiles
CREATE INDEX idx_asset_portfolio ON asset(portfolio_id);
CREATE INDEX idx_recommendation_portfolio ON recommendation(portfolio_id);
CREATE INDEX idx_recommendation_generated_at ON recommendation(generated_at DESC);
CREATE INDEX idx_recommendation_action_reco ON recommendation_action(recommendation_id);
