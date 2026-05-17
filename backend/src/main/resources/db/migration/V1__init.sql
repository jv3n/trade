-- =============================================================================
-- PortfolioAI — schéma initial unifié (collapse V1→V10 livré 2026-05-17)
--
-- Cette migration consolide les 10 migrations historiques en un seul `CREATE TABLE`
-- propre par table vivante. Avant la fusion, la séquence V1→V10 incluait :
--   - V1__init        : Phase 0 (RSS feeds, recommandations IA, jobs analysis) + Phase 1
--                       (portfolio, asset, portfolio_snapshot, snapshot_position).
--   - V2__ticker_narrative : ticker_narrative_snapshot + ticker_narrative_job.
--   - V3__watchlist        : watchlist_entry.
--   - V4__app_config       : app_config (clé/valeur runtime).
--   - V5__asset_lifecycle  : asset.status / opened_at / closed_at.
--   - V6__drop_phase0      : drop des 6 tables Phase 0 décommissionnées en Phase 2.5.
--   - V7__watchlist_instrument_type : ajoute watchlist_entry.instrument_type.
--   - V8__prompt_template  : prompt_template + prompt_score + FK sur ticker_narrative_snapshot.
--   - V9__app_user         : app_user (foundation Phase 4 auth).
--   - V10__user_scoped_portfolio_watchlist : ajoute portfolio.user_id et watchlist_entry.user_id,
--                                            relax UNIQUE(symbol) en UNIQUE(user_id, symbol).
--
-- Pourquoi consolider maintenant : on est en local single-user, V10 vient de livrer un état
-- stable, et avant le premier déploiement (Phase 5) cette fusion est zéro risque. Une fois en
-- prod, refaire ce travail demanderait un dump-restore coordonné — bien plus risqué.
--
-- Procédure de migration pour les DB existantes : `spring.flyway.baseline-on-migrate: true` +
-- `spring.flyway.baseline-version: 1` dans `application.yml`. Au prochain boot, Flyway constate
-- que la DB a déjà `flyway_schema_history` à V10, log `Successfully baselined schema with version: 1`,
-- et toutes les futures migrations partent de V2. Aucune perte de data.
--
-- Pour repartir d'un repo greenfield : `docker compose down -v && tilt up` regénère une DB qui
-- applique ce V1 ex nihilo. Les imports CSV doivent être rejoués manuellement.
--
-- Ordre des CREATE TABLE = ordre des dépendances FK (parent avant enfant) :
--   1. app_user        — racine du graphe multi-tenant
--   2. portfolio       — dépend de app_user
--   3. asset           — dépend de portfolio
--   4. portfolio_snapshot + snapshot_position — dépendent de portfolio
--   5. watchlist_entry — dépend de app_user
--   6. app_config      — autonome
--   7. prompt_template — autonome (doit précéder ticker_narrative_snapshot pour le FK)
--   8. ticker_narrative_snapshot — dépend de prompt_template (FK ON DELETE SET NULL)
--   9. ticker_narrative_job      — dépend de ticker_narrative_snapshot
--  10. prompt_score              — dépend de ticker_narrative_snapshot + prompt_template
--
-- Le seul seed appliqué ici est le prompt_template `narrative-default` v2 actif — repris verbatim
-- du `NARRATIVE_SYSTEM_PROMPT` Kotlin (cf. `TickerNarrativePrompt.kt`).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) app_user — Phase 4 foundation
-- -----------------------------------------------------------------------------
-- Email = clé naturelle (UNIQUE) ; provider + provider_id pour traçabilité multi-provider futur
-- mais pas en clé d'unicité. Nom de table `app_user` parce que `user` est un mot réservé PostgreSQL.

CREATE TABLE app_user (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    display_name  VARCHAR(255),
    provider      VARCHAR(50)  NOT NULL,
    provider_id   VARCHAR(255),
    role          VARCHAR(20)  NOT NULL CHECK (role IN ('ADMIN', 'USER')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);


-- -----------------------------------------------------------------------------
-- 2) portfolio — multi-tenant via user_id (V10)
-- -----------------------------------------------------------------------------
-- ON DELETE CASCADE depuis app_user : delete user = clean tous ses portfolios + cascades enfants
-- (assets, snapshots, snapshot_positions).

CREATE TABLE portfolio (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_portfolio_user ON portfolio(user_id);


-- -----------------------------------------------------------------------------
-- 3) asset — positions détenues avec lifecycle OPEN/CLOSED (V5)
-- -----------------------------------------------------------------------------
-- Le user_id est hérité via FK vers portfolio (pas de colonne directe). Le lifecycle status
-- distingue les positions vivantes (OPEN, affichées au dashboard) des positions soldées (CLOSED,
-- conservées avec leurs dernières valeurs pour la future page « Positions historiques »).

CREATE TABLE asset (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id    UUID          NOT NULL REFERENCES portfolio(id) ON DELETE CASCADE,
    ticker          VARCHAR(20)   NOT NULL,
    name            VARCHAR(255)  NOT NULL,
    quantity        NUMERIC(18,6) NOT NULL,
    avg_buy_price   NUMERIC(18,4) NOT NULL,
    asset_type      VARCHAR(50)   NOT NULL,                  -- ETF, STOCK, COMMODITY, CRYPTO, BOND
    currency        VARCHAR(10)   NOT NULL DEFAULT 'CAD',
    book_value_cad  NUMERIC(18,2) NOT NULL DEFAULT 0,
    market_value    NUMERIC(18,4) NOT NULL DEFAULT 0,
    unrealized_gain NUMERIC(18,4),
    gain_currency   VARCHAR(10),
    status          VARCHAR(10)   NOT NULL DEFAULT 'OPEN',   -- OPEN | CLOSED (V5 lifecycle)
    opened_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    closed_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_asset_portfolio        ON asset(portfolio_id);
CREATE INDEX idx_asset_portfolio_status ON asset(portfolio_id, status);


-- -----------------------------------------------------------------------------
-- 4) portfolio_snapshot + snapshot_position — historique des imports CSV
-- -----------------------------------------------------------------------------
-- Un import CSV produit une row `portfolio_snapshot` par account + N rows `snapshot_position`
-- (une par ticker détenu au moment de l'import). batch_id regroupe les snapshots du même import
-- multi-account, imported_at = date extraite du filename quand possible.

CREATE TABLE portfolio_snapshot (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id     UUID        NOT NULL,
    portfolio_id UUID        NOT NULL REFERENCES portfolio(id) ON DELETE CASCADE,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_snapshot_imported  ON portfolio_snapshot(imported_at DESC);
CREATE INDEX idx_snapshot_batch     ON portfolio_snapshot(batch_id);
CREATE INDEX idx_snapshot_portfolio ON portfolio_snapshot(portfolio_id, imported_at DESC);

CREATE TABLE snapshot_position (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id     UUID          NOT NULL REFERENCES portfolio_snapshot(id) ON DELETE CASCADE,
    ticker          VARCHAR(20)   NOT NULL,
    name            TEXT          NOT NULL,
    asset_type      VARCHAR(50)   NOT NULL,
    quantity        NUMERIC(18,6) NOT NULL,
    book_value_cad  NUMERIC(18,2) NOT NULL,
    market_value    NUMERIC(18,4) NOT NULL,
    market_currency VARCHAR(10)   NOT NULL,
    unrealized_gain NUMERIC(18,4),
    gain_currency   VARCHAR(10)
);


-- -----------------------------------------------------------------------------
-- 5) watchlist_entry — multi-tenant via user_id (V10), instrument_type (V7)
-- -----------------------------------------------------------------------------
-- UNIQUE(user_id, symbol) permet à plusieurs users de watcher le même ticker. Le service
-- normalise le symbole (uppercase + trim) avant insert pour que la contrainte attrape les
-- variantes `aapl` vs `AAPL`. instrument_type est snapshotté au moment du POST add pour éviter
-- un burst Twelve Data au mount du dashboard (cf. V7 historique).

CREATE TABLE watchlist_entry (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    symbol          VARCHAR(20) NOT NULL,
    added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    instrument_type VARCHAR(20),
    CONSTRAINT watchlist_entry_user_symbol_key UNIQUE (user_id, symbol)
);

CREATE INDEX idx_watchlist_symbol ON watchlist_entry(symbol);
CREATE INDEX idx_watchlist_user   ON watchlist_entry(user_id);


-- -----------------------------------------------------------------------------
-- 6) app_config — runtime config overrides (clé/valeur)
-- -----------------------------------------------------------------------------
-- Table partagée par tous les users (ADMIN-only via `/api/config/**` gated dans SecurityConfig).
-- Une ligne par clé surchargée ; absence de ligne ⇒ fallback YAML default via AppConfigService.

CREATE TABLE app_config (
    config_key   VARCHAR(100) PRIMARY KEY,
    config_value TEXT         NOT NULL,
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- 7) prompt_template — versions de prompts narratifs (Phase 3)
-- -----------------------------------------------------------------------------
-- Au plus une ligne `is_active = TRUE` par `name` (partial unique index). Le seed v2 actif est
-- inséré en fin de fichier, après que toutes les tables soient créées (le FK depuis
-- ticker_narrative_snapshot.prompt_template_id se câble proprement).

CREATE TABLE prompt_template (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL,
    version       VARCHAR(50)  NOT NULL,
    system_prompt TEXT         NOT NULL,
    user_template TEXT,
    target_model  VARCHAR(100),
    is_active     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    activated_at  TIMESTAMPTZ,
    deprecated_at TIMESTAMPTZ,
    notes         TEXT
);

CREATE UNIQUE INDEX idx_prompt_template_active_per_name
    ON prompt_template(name) WHERE is_active = TRUE;


-- -----------------------------------------------------------------------------
-- 8) ticker_narrative_snapshot — sortie LLM par ticker (Phase 1 + Phase 3 prompt_template_id)
-- -----------------------------------------------------------------------------
-- Partagé entre users par décision produit (un narratif AAPL du jour est valable pour tout le
-- monde, coût LLM stable). Pas de user_id ici. prompt_template_id nullable pour absorber les
-- snapshots historiques sans template référencé (cas pré-Phase 3).

CREATE TABLE ticker_narrative_snapshot (
    id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol             VARCHAR(20)   NOT NULL,
    generated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    price              NUMERIC(18,4) NOT NULL,
    indicators_json    JSONB         NOT NULL,
    summary            TEXT          NOT NULL,
    sentiment          VARCHAR(10)   NOT NULL,                  -- BULLISH | NEUTRAL | BEARISH
    key_points_json    JSONB         NOT NULL,                  -- string[3..5]
    model_used         VARCHAR(100)  NOT NULL,
    prompt_version     VARCHAR(50)   NOT NULL DEFAULT 'v1',
    prompt_template_id UUID          REFERENCES prompt_template(id) ON DELETE SET NULL
);

CREATE INDEX idx_ticker_narrative_snapshot_symbol_generated
    ON ticker_narrative_snapshot(symbol, generated_at DESC);

CREATE INDEX idx_ticker_narrative_snapshot_prompt_template
    ON ticker_narrative_snapshot(prompt_template_id);


-- -----------------------------------------------------------------------------
-- 9) ticker_narrative_job — suivi asynchrone du pipeline narratif (Phase 1)
-- -----------------------------------------------------------------------------
-- Le front kick un POST, poll via SSE `/api/market/ticker/{symbol}/narrative/jobs/{id}/stream`
-- jusqu'à DONE/ERROR, puis lit le snapshot référencé.

CREATE TABLE ticker_narrative_job (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol      VARCHAR(20) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    status      VARCHAR(10) NOT NULL DEFAULT 'PENDING',         -- PENDING | DONE | ERROR
    snapshot_id UUID        REFERENCES ticker_narrative_snapshot(id) ON DELETE SET NULL,
    error       TEXT
);

CREATE INDEX idx_ticker_narrative_job_symbol_status_created
    ON ticker_narrative_job(symbol, status, created_at DESC);


-- -----------------------------------------------------------------------------
-- 10) prompt_score — une ligne de score par run narratif (Phase 3 #1 PR2)
-- -----------------------------------------------------------------------------
-- snapshot_id nullable pour qu'un run définitivement KO (parser + validator failed) persiste
-- quand même son score (latence, retry_count, flags) sans `INSERT` orphelin.

CREATE TABLE prompt_score (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id        UUID         REFERENCES ticker_narrative_snapshot(id) ON DELETE SET NULL,
    prompt_template_id UUID         NOT NULL REFERENCES prompt_template(id) ON DELETE RESTRICT,
    latency_ms         INTEGER      NOT NULL,
    retry_count        INTEGER      NOT NULL DEFAULT 0,
    parse_failed       BOOLEAN      NOT NULL DEFAULT FALSE,
    validator_failed   BOOLEAN      NOT NULL DEFAULT FALSE,
    user_thumbs        SMALLINT     NOT NULL DEFAULT 0 CHECK (user_thumbs IN (-1, 0, 1)),
    llm_judge_score    NUMERIC(5,2),
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_prompt_score_prompt_template
    ON prompt_score(prompt_template_id, created_at DESC);

CREATE INDEX idx_prompt_score_snapshot
    ON prompt_score(snapshot_id);


-- =============================================================================
-- Seed initial — prompt narrative-default v2 actif
-- =============================================================================
-- Copié verbatim depuis le constant `NARRATIVE_SYSTEM_PROMPT` côté Kotlin
-- (`TickerNarrativePrompt.kt`, après `.trimIndent()`). Dollar-quoted pour éviter l'escape des
-- apostrophes (« ticker's », « it's missing »).

INSERT INTO prompt_template (name, version, system_prompt, is_active, activated_at)
VALUES (
    'narrative-default',
    'v2',
    $prompt$You are a financial writer. Given one ticker's current price and pre-computed indicators, produce a short factual technical summary — describe what the indicators show, no predictions, no buy/sell advice.

Reply with ONLY this JSON object (no prose, no markdown fences) :
{
  "summary": "2-3 sentences describing posture: price vs MAs, RSI, momentum, drawdown. Neutral tone, no forecasts.",
  "sentiment": "BULLISH" | "NEUTRAL" | "BEARISH",
  "keyPoints": ["3-5 bullets, each ≤15 words, each grounded in one indicator value from the input. No invented numbers."]
}

Sentiment rule: price above MA200 + positive momentum + RSI 50-70 → BULLISH ; price below MA200 + negative momentum + deep drawdown → BEARISH ; otherwise NEUTRAL.

If an indicator is null in the input (series too short), skip it silently — never mention it's missing.$prompt$,
    TRUE,
    now()
);
