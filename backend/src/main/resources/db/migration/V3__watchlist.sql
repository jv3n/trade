-- =============================================================================
-- Watchlist — tickers à surveiller hors portefeuille
-- =============================================================================
--
-- Single-table feature : on persiste juste le symbole et sa date d'ajout. Pas de
-- user_id (l'app reste single-user pour l'instant) ; si on bascule un jour multi-
-- tenant, on ajoute une colonne nullable + on rétro-fill avec un user système.
--
-- Le symbole est uppercase + trim côté service avant insertion ; la contrainte
-- UNIQUE garde la table propre même en cas de double POST simultané.

CREATE TABLE watchlist_entry (
    id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol   VARCHAR(20) NOT NULL UNIQUE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_watchlist_symbol ON watchlist_entry(symbol);
