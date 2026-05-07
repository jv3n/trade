-- =============================================================================
-- Décommissionnement Phase 0 — drop des tables legacy
-- =============================================================================
--
-- Phase 0 (recommandations portefeuille basées sur scraping RSS + LLM) est gelée
-- depuis Phase 1 et n'est plus dans le user flow. Le scheduler RSS était déjà gaté
-- par `ingestion.rss.enabled: false` (commit 04d8509) mais les tables existaient
-- toujours, et `AnalysisExecutor` les chargeait encore dans le prompt LLM, faisant
-- saturer le contexte d'Ollama (cf. incident 2026-05-07).
--
-- V6 nettoie le schéma. Les modules backend correspondants (`ingestion/`, classes
-- Phase 0 du package `analysis/`) sont supprimés dans le même PR — ce drop SQL
-- ne peut donc pas être appliqué seul à un binaire qui parle encore à ces tables.
--
-- Phase 4 (« Réintégration Phase 0 ») est en backlog mais repartira d'un schéma
-- neuf basé sur les snapshots Phase 1+2 (TickerNarrativeSnapshot + analyst recos
-- + earnings + news per-ticker). Pas de réutilisation des tables ci-dessous prévue.
--
-- Ordre des DROP : les tables enfant d'abord (FK vers `recommendation` puis vers
-- `feed_source`), pour éviter d'avoir à passer en CASCADE et de masquer
-- accidentellement une dépendance qu'on n'aurait pas vue.

DROP TABLE IF EXISTS recommendation_score;
DROP TABLE IF EXISTS recommendation_action;
DROP TABLE IF EXISTS analysis_job;
DROP TABLE IF EXISTS recommendation;

DROP TABLE IF EXISTS feed_article;
DROP TABLE IF EXISTS feed_source;
