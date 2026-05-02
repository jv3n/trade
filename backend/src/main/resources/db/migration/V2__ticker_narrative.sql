-- =============================================================================
-- Phase 1 — Pipeline narratif par ticker
--
-- Le LLM digère les indicateurs déjà calculés (RSI, MA, momentum…) et écrit un
-- court résumé. Persisté pour observabilité (CLAUDE.md : "Snapshot du narratif
-- systématique") et pour servir de cache 30 min côté API.
-- =============================================================================


-- Snapshot de l'output LLM. Un par requête réussie.
CREATE TABLE ticker_narrative_snapshot (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol          VARCHAR(20)  NOT NULL,
    generated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- Snapshot des inputs au moment de la génération, pour relire dans 6 mois
    -- ce que disait l'IA en regardant quoi.
    price           NUMERIC(18,4) NOT NULL,
    indicators_json JSONB        NOT NULL,
    -- Output LLM.
    summary         TEXT         NOT NULL,
    sentiment       VARCHAR(10)  NOT NULL,    -- BULLISH | NEUTRAL | BEARISH
    key_points_json JSONB        NOT NULL,    -- string[3..5]
    -- Provenance pour comparer entre modèles plus tard.
    model_used      VARCHAR(100) NOT NULL,
    prompt_version  VARCHAR(50)  NOT NULL DEFAULT 'v1'
);

CREATE INDEX idx_ticker_narrative_snapshot_symbol_generated
    ON ticker_narrative_snapshot(symbol, generated_at DESC);


-- Job asynchrone : front kick un POST, poll jusqu'à DONE/ERROR puis lit le
-- snapshot référencé. Mirror du pattern `analysis_job`.
CREATE TABLE ticker_narrative_job (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol       VARCHAR(20)  NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    status       VARCHAR(10)  NOT NULL DEFAULT 'PENDING', -- PENDING | DONE | ERROR
    snapshot_id  UUID         REFERENCES ticker_narrative_snapshot(id) ON DELETE SET NULL,
    error        TEXT
);

CREATE INDEX idx_ticker_narrative_job_symbol_status_created
    ON ticker_narrative_job(symbol, status, created_at DESC);
