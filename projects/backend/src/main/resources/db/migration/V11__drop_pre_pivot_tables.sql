-- 2026-09 rework : the app narrows down to trading tracking. Drops the tables of the removed
-- modules — watchlist, LLM pipeline and radar.
--
-- Dependent tables first (FK to ticker_narrative_snapshot / prompt_template).

DROP TABLE IF EXISTS prompt_score;
DROP TABLE IF EXISTS ticker_narrative_job;
DROP TABLE IF EXISTS ticker_narrative_snapshot;
DROP TABLE IF EXISTS prompt_template;
DROP TABLE IF EXISTS screener_snapshot_day;
DROP TABLE IF EXISTS watchlist_entry;

-- Runtime overrides of the removed keys. The login whitelist is the only hot-editable key left.
DELETE FROM app_config WHERE config_key <> 'app.allowed.emails';
