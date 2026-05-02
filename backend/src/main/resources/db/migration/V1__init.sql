-- =============================================================================
-- Schéma initial PortfolioAI
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Portefeuille & actifs
-- -----------------------------------------------------------------------------

CREATE TABLE portfolio (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE asset (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id   UUID          NOT NULL REFERENCES portfolio(id) ON DELETE CASCADE,
    ticker         VARCHAR(20)   NOT NULL,
    name           VARCHAR(255)  NOT NULL,
    quantity       NUMERIC(18,6) NOT NULL,
    avg_buy_price  NUMERIC(18,4) NOT NULL,
    asset_type     VARCHAR(50)   NOT NULL,   -- ETF, STOCK, COMMODITY, CRYPTO, BOND
    currency       VARCHAR(10)   NOT NULL DEFAULT 'CAD',
    book_value_cad NUMERIC(18,2) NOT NULL DEFAULT 0,
    market_value   NUMERIC(18,4) NOT NULL DEFAULT 0,
    unrealized_gain NUMERIC(18,4),
    gain_currency  VARCHAR(10),
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_asset_portfolio ON asset(portfolio_id);


-- -----------------------------------------------------------------------------
-- Recommandations IA
-- -----------------------------------------------------------------------------

CREATE TABLE recommendation (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id    UUID        NOT NULL REFERENCES portfolio(id) ON DELETE CASCADE,
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    context_summary TEXT        NOT NULL,  -- résumé du contexte macro injecté dans le prompt
    prompt_version  VARCHAR(50) NOT NULL DEFAULT 'v1',
    content         TEXT        NOT NULL,  -- texte brut de la recommandation IA
    confidence      SMALLINT    CHECK (confidence BETWEEN 0 AND 100),
    status          VARCHAR(30) NOT NULL DEFAULT 'PENDING'  -- PENDING, APPLIED, IGNORED, EVALUATED
);

CREATE TABLE recommendation_action (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID        NOT NULL REFERENCES recommendation(id) ON DELETE CASCADE,
    ticker            VARCHAR(20) NOT NULL,
    action            VARCHAR(10) NOT NULL,  -- BUY, SELL, HOLD, REDUCE
    rationale         TEXT,
    target_weight     NUMERIC(5,2)  -- % cible dans le portefeuille
);

CREATE TABLE recommendation_score (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID        NOT NULL UNIQUE REFERENCES recommendation(id) ON DELETE CASCADE,
    evaluated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    directional_score NUMERIC(5,2),   -- % de bonnes directions prédites
    relative_perf     NUMERIC(8,4),   -- performance vs benchmark (ex: VOO)
    notes             TEXT
);

CREATE INDEX idx_recommendation_portfolio    ON recommendation(portfolio_id);
CREATE INDEX idx_recommendation_generated_at ON recommendation(generated_at DESC);
CREATE INDEX idx_recommendation_action_reco  ON recommendation_action(recommendation_id);


-- -----------------------------------------------------------------------------
-- Jobs d'analyse (suivi asynchrone LLM)
-- -----------------------------------------------------------------------------

CREATE TABLE analysis_job (
    id                UUID        PRIMARY KEY,
    portfolio_id      UUID        NOT NULL REFERENCES portfolio(id),
    status            VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    recommendation_id UUID        REFERENCES recommendation(id),
    error             TEXT
);

CREATE INDEX idx_analysis_job_portfolio_status ON analysis_job(portfolio_id, status);


-- -----------------------------------------------------------------------------
-- Snapshots de portefeuille (historique des imports CSV)
-- -----------------------------------------------------------------------------

CREATE TABLE portfolio_snapshot (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id     UUID        NOT NULL,  -- regroupe les positions du même import
    portfolio_id UUID        NOT NULL REFERENCES portfolio(id) ON DELETE CASCADE,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE snapshot_position (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id     UUID          NOT NULL REFERENCES portfolio_snapshot(id) ON DELETE CASCADE,
    ticker          VARCHAR(20)   NOT NULL,
    name            TEXT          NOT NULL,
    asset_type      VARCHAR(50)   NOT NULL,
    quantity        NUMERIC(18,6) NOT NULL,
    book_value_cad  NUMERIC(18,2) NOT NULL,   -- valeur comptable (toujours en CAD)
    market_value    NUMERIC(18,4) NOT NULL,   -- valeur marchande (devise native)
    market_currency VARCHAR(10)   NOT NULL,
    unrealized_gain NUMERIC(18,4),            -- rendements non réalisés
    gain_currency   VARCHAR(10)
);

CREATE INDEX idx_snapshot_imported  ON portfolio_snapshot(imported_at DESC);
CREATE INDEX idx_snapshot_batch     ON portfolio_snapshot(batch_id);
CREATE INDEX idx_snapshot_portfolio ON portfolio_snapshot(portfolio_id, imported_at DESC);


-- -----------------------------------------------------------------------------
-- Sources d'ingestion
-- Catégories : RSS (flux presse), MARKET (données de marché),
--              MACRO (indicateurs économiques), CRYPTO (cryptomonnaies)
-- enabled     : false = désactivée (URL morte, payante ou non encore intégrée)
-- free        : false = abonnement ou clé API payante requise
-- requires_api_key : clé API nécessaire même sur le plan gratuit
-- -----------------------------------------------------------------------------

CREATE TABLE feed_source (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    slug             VARCHAR(100) NOT NULL UNIQUE,
    name             VARCHAR(255) NOT NULL,
    url              TEXT         NOT NULL UNIQUE,
    category         VARCHAR(50)  NOT NULL,
    enabled          BOOLEAN      NOT NULL DEFAULT true,
    description      TEXT         NOT NULL DEFAULT '',
    free             BOOLEAN      NOT NULL DEFAULT true,
    requires_api_key BOOLEAN      NOT NULL DEFAULT false
);

CREATE TABLE feed_article (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id    UUID        NOT NULL REFERENCES feed_source(id) ON DELETE CASCADE,
    guid         TEXT        NOT NULL,
    title        TEXT        NOT NULL,
    description  TEXT,
    link         TEXT,
    published_at TIMESTAMPTZ,
    fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_id, guid)
);

CREATE INDEX idx_feed_article_source       ON feed_article(source_id);
CREATE INDEX idx_feed_article_published_at ON feed_article(published_at DESC);
CREATE INDEX idx_feed_article_fetched_at   ON feed_article(fetched_at DESC);


-- -----------------------------------------------------------------------------
-- Seed : sources de données
-- RSS actives : Le Monde Économie, CNBC Markets, MarketWatch
-- RSS inactives : Reuters (URLs mortes), BFM (bloquée), Les Echos (payant),
--                 Seeking Alpha (payant)
-- MARKET actives : Yahoo Finance, Stooq
-- MACRO actives : FRED, BCE
-- Reste : désactivé (non encore intégré ou clé requise)
-- -----------------------------------------------------------------------------

INSERT INTO feed_source (slug, name, url, category, enabled, description, free, requires_api_key) VALUES

    -- Presse & Flux RSS
    ('reuters-business', 'Reuters Business',  'https://feeds.reuters.com/reuters/businessNews',                                        'RSS', false, 'Actualité économique mondiale — URL morte depuis 2020',      true,  false),
    ('reuters-markets',  'Reuters Markets',   'https://feeds.reuters.com/reuters/marketsNews',                                         'RSS', false, 'Marchés financiers — URL morte depuis 2020',                 true,  false),
    ('bfm-bourse',       'BFM Bourse',        'https://bfmbusiness.bfmtv.com/rss/info/flux-rss/flux-toutes-les-actualites/',           'RSS', false, 'Actualité bourse française — accès bloqué',                  true,  false),
    ('les-echos',        'Les Echos',         'https://www.lesechos.fr/rss/rss_finance.xml',                                          'RSS', false, 'Finance et économie française',                              false, false),
    ('seeking-alpha',    'Seeking Alpha',     'https://seekingalpha.com/feed.xml',                                                    'RSS', false, 'Analyses approfondies d''actions',                           false, false),
    ('lemonde-eco',      'Le Monde Économie', 'https://www.lemonde.fr/economie/rss_full.xml',                                         'RSS', true,  'Couverture macro française',                                 true,  false),
    ('cnbc-markets',     'CNBC Markets',      'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258',  'RSS', true,  'Actualité marchés US',                                       true,  false),
    ('marketwatch',      'MarketWatch',       'https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines',                   'RSS', true,  'Headlines temps réel US',                                    true,  false),

    -- Données de marché
    ('yahoo-finance',    'Yahoo Finance',     'https://finance.yahoo.com',                                                            'MARKET', true,  'Cours, historique, fondamentaux — aucune clé requise',   true,  false),
    ('stooq',            'Stooq',             'https://stooq.com',                                                                    'MARKET', true,  'Cours historiques EOD, couverture mondiale',              true,  false),
    ('alpha-vantage',    'Alpha Vantage',     'https://www.alphavantage.co',                                                          'MARKET', false, 'Cours + indicateurs techniques',                         true,  true),
    ('finnhub',          'Finnhub',           'https://finnhub.io',                                                                   'MARKET', false, 'Cours temps réel, news, fondamentaux',                   true,  true),
    ('polygon',          'Polygon.io',        'https://polygon.io',                                                                   'MARKET', false, 'Cours, options, crypto — très complet',                  true,  true),
    ('twelve-data',      'Twelve Data',       'https://twelvedata.com',                                                               'MARKET', false, 'Cours, ETF, indicateurs techniques',                     true,  true),

    -- Indicateurs macro-économiques
    ('fred',             'FRED (Federal Reserve)', 'https://fred.stlouisfed.org',                                                     'MACRO', true,  'Indicateurs US : PIB, inflation, taux directeurs',       true,  true),
    ('bce',              'BCE',                    'https://data.ecb.europa.eu',                                                      'MACRO', true,  'Indicateurs zone euro',                                  true,  false),
    ('world-bank',       'Banque Mondiale',         'https://data.worldbank.org',                                                     'MACRO', false, 'Indicateurs économiques mondiaux',                       true,  false),
    ('insee',            'INSEE',                   'https://api.insee.fr',                                                           'MACRO', false, 'Statistiques économiques françaises',                    true,  true),
    ('pboc',             'PBOC (Banque de Chine)',  'https://www.pbc.gov.cn',                                                         'MACRO', false, 'Indicateurs Chine : taux, réserves, masse monétaire',    true,  false),
    ('boj',              'BOJ (Banque du Japon)',   'https://www.stat-search.boj.or.jp',                                              'MACRO', false, 'Indicateurs Japon : taux, inflation, balance des paiements', true, false),
    ('mas',              'MAS (Singapour)',          'https://eservices.mas.gov.sg/apimg',                                             'MACRO', false, 'Indicateurs Singapour : taux de change, inflation',      true,  false),

    -- Crypto
    ('coingecko',        'CoinGecko',         'https://www.coingecko.com/api',                                                        'CRYPTO', true,  'Cours, market cap, volumes crypto',                     true,  false),
    ('binance',          'Binance Public API','https://binance-docs.github.io/apidocs/',                                              'CRYPTO', false, 'Cours temps réel crypto',                               true,  false),
    ('coinmarketcap',    'CoinMarketCap',     'https://coinmarketcap.com/api/',                                                       'CRYPTO', false, 'Cours et market cap crypto',                            true,  true);
