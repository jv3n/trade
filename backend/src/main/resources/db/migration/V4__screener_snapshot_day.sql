-- =============================================================================
-- V4 — Phase 6 ticket (9) : persistance du snapshot screener
--
-- Une seule ligne par (date, provider) — le bouton « Rechercher » côté UI déclenche
-- un POST /api/screener/refresh qui UPSERT cette ligne. Les tweaks du panneau filtres
-- opèrent ensuite in-process sur le payload JSONB sans re-hit le provider.
--
-- Pourquoi (date, provider) plutôt qu'un id par refresh : single-user, on n'a pas
-- besoin de l'historique intra-jour. Garder 1 ligne par jour borne la croissance
-- de la table (~3 lignes/jour max) et simplifie le ticket (4) historique radar
-- (un point par jour suffit pour rejouer « qu'est-ce qui a tenu vs s'est effondré »).
--
-- `movers JSONB` porte la liste brute des `TickerMover` retournés par l'adapter au
-- moment du refresh (shape ≈ `TickerMoverDto` sérialisé). Le filtre dynamique
-- (gap %, volume ratio, cap range, exchange, sector) est appliqué côté service au
-- chargement, pas persisté — on garde la matière brute pour pouvoir resserrer la cible
-- (cf. ticket (8)) sans avoir à re-refresh.
--
-- `provider VARCHAR(20)` aligné sur les valeurs `ConfigKeys.PROVIDER_*` (`mock`,
-- `polygon`, `fmp`) — pas un enum SQL parce qu'un nouveau provider n'a pas à exiger
-- une migration de schéma.
-- =============================================================================

CREATE TABLE screener_snapshot_day (
    date        DATE         NOT NULL,
    provider    VARCHAR(20)  NOT NULL,
    movers      JSONB        NOT NULL,
    fetched_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (date, provider)
);

-- Recherche du snapshot le plus récent toutes dates confondues pour un provider donné —
-- chemin de lecture par défaut quand l'UI ouvre la page `/radar` sans `?date=`.
CREATE INDEX idx_screener_snapshot_provider_date ON screener_snapshot_day (provider, date DESC);
