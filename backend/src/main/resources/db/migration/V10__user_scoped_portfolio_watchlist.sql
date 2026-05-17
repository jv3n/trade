-- =============================================================================
-- Phase 4 — Migration multi-tenant (user_id sur portfolio + watchlist_entry)
--
-- Ajoute la FK `user_id REFERENCES app_user(id)` sur les deux tables qui contiennent
-- de la donnée privée par user. Les tables exclues volontairement :
--
--   - `asset` / `portfolio_snapshot` / `snapshot_position` — héritent via cascade
--     FK vers `portfolio.id`, déjà en place. Filtrer par user_id se fait au JOIN.
--   - `ticker_narrative_snapshot` / `ticker_narrative_job` — narratives partagées
--     entre users (décision produit : un narratif AAPL du jour est valable pour
--     tout le monde, coût LLM stable).
--   - `app_config` — config globale gérée par ADMIN, déjà gated `/api/config/**`
--     → `hasRole("ADMIN")`. Multi-tenancy de la config = chaque user paye son
--     Claude, complique tout sans gain produit clair.
--   - `prompt_template` / `prompt_score` — prompts narratifs partagés, ADMIN-only.
--
-- Backfill strategy (cf. backlog Phase 4 — décision actée 2026-05-17) :
-- assigner toutes les rows existantes au user `dev@local.test` (le user fake seedé
-- par `LocalNoAuthUserInitializer` au boot sous profile `local-no-auth`, idempotent).
-- Edge case : un deploy frais qui n'a jamais bootté en `local-no-auth` n'a pas ce
-- user → backfill no-op → ALTER NOT NULL passe quand même parce que les tables
-- sont vides à ce stade. Robust.
--
-- Conséquence pour le dev : sous `local-no-auth` tes portfolios/watchlists actuels
-- te restent attribués (dev@local.test). En basculant vers `BACKEND_AUTH_MODE=oauth`
-- avec ton vrai compte Google, état vide initial — re-importer un CSV pour peupler
-- sous ton nouveau user_id. L'ancien data dev@local.test reste en BDD (orphaned
-- mais non supprimé).
--
-- ON DELETE CASCADE : si un user est supprimé un jour (rare), ses portfolios +
-- watchlists + données dérivées (assets, snapshots) sont nettoyées en un coup.
-- RESTRICT serait plus prudent mais laisserait des données orphelines si on doit
-- jamais supprimer un compte. CASCADE est aligné avec la sémantique "delete user
-- = remove their data" attendue (RGPD-friendly).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) portfolio.user_id
-- -----------------------------------------------------------------------------

ALTER TABLE portfolio
    ADD COLUMN user_id UUID REFERENCES app_user(id) ON DELETE CASCADE;

UPDATE portfolio
SET user_id = (SELECT id FROM app_user WHERE email = 'dev@local.test')
WHERE user_id IS NULL
  AND EXISTS (SELECT 1 FROM app_user WHERE email = 'dev@local.test');

ALTER TABLE portfolio
    ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX idx_portfolio_user ON portfolio(user_id);


-- -----------------------------------------------------------------------------
-- 2) watchlist_entry.user_id + relax UNIQUE(symbol) → UNIQUE(user_id, symbol)
--
-- Sans cette modification, deux users ne pourraient pas tous les deux watcher AAPL
-- (la contrainte UNIQUE sur symbol seul rejetterait le 2e insert). On scope la
-- contrainte au user — deux entries (alice, AAPL) et (bob, AAPL) coexistent.
-- L'index sur `symbol` seul reste pour les lookups directs symbol → entries (rare
-- en pratique mais aucun coût à le garder).
-- -----------------------------------------------------------------------------

ALTER TABLE watchlist_entry
    ADD COLUMN user_id UUID REFERENCES app_user(id) ON DELETE CASCADE;

UPDATE watchlist_entry
SET user_id = (SELECT id FROM app_user WHERE email = 'dev@local.test')
WHERE user_id IS NULL
  AND EXISTS (SELECT 1 FROM app_user WHERE email = 'dev@local.test');

ALTER TABLE watchlist_entry
    ALTER COLUMN user_id SET NOT NULL;

-- L'ancienne contrainte UNIQUE sur (symbol) est nommée automatiquement par
-- PostgreSQL : `watchlist_entry_symbol_key` (pattern `<table>_<column>_key` pour
-- une contrainte UNIQUE inline sur une colonne unique). On la drop par nom.
ALTER TABLE watchlist_entry
    DROP CONSTRAINT watchlist_entry_symbol_key;

ALTER TABLE watchlist_entry
    ADD CONSTRAINT watchlist_entry_user_symbol_key UNIQUE (user_id, symbol);

CREATE INDEX idx_watchlist_user ON watchlist_entry(user_id);
