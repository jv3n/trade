-- =============================================================================
-- Runtime configuration overrides — clés/valeurs éditables depuis /settings/configuration
-- =============================================================================
--
-- Permet de surcharger en runtime ce qui vit en `application.yml` sans redémarrer
-- le backend. Une ligne par clé surchargée ; absence de ligne ⇒ on retombe sur
-- le défaut YAML (`@Value(...)` injecté à la construction du bean reste utilisé
-- comme fallback, voir AppConfigService).
--
-- v1 — clés gérées :
--   market.twelvedata.api-key   (clé API Twelve Data)
--   market.finnhub.api-key      (clé API Finnhub)
--   market.cache.ttl-minutes    (TTL Caffeine partagé market-chart + news-by-symbol)
--
-- Pas de typage strict (TEXT) ; la couche service parse en Int/String selon la
-- clé. Si on grossit beaucoup, on ajoutera une colonne `value_type`.
--
-- Pas de chiffrement v1 — projet local, BDD sur la machine du dev. À durcir si
-- on déploie un jour (pgcrypto + clé hors-BDD).

CREATE TABLE app_config (
    config_key VARCHAR(100) PRIMARY KEY,
    config_value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
