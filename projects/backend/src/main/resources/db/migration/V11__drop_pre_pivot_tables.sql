-- Refonte 2026-09 : l'app se recentre sur le suivi de trading (compte, journal, stats, fiche
-- candidat, lexique). Suppression des tables des modules retirés : watchlist, pipeline LLM
-- (prompts, narratifs, jobs, scores) et radar (snapshots screener).
--
-- Ordre : les tables dépendantes d'abord (FK vers ticker_narrative_snapshot / prompt_template).

DROP TABLE IF EXISTS prompt_score;
DROP TABLE IF EXISTS ticker_narrative_job;
DROP TABLE IF EXISTS ticker_narrative_snapshot;
DROP TABLE IF EXISTS prompt_template;
DROP TABLE IF EXISTS screener_snapshot_day;
DROP TABLE IF EXISTS watchlist_entry;

-- Overrides runtime des clés supprimées (providers de données, LLM, TTL cache). Seule la
-- whitelist de login reste une clé éditable à chaud.
DELETE FROM app_config WHERE config_key <> 'app.allowed.emails';
