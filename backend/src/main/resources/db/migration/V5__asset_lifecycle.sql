-- =============================================================================
-- Lifecycle de position — status OPEN / CLOSED + dates open/close
-- =============================================================================
--
-- Avant V5, l'import CSV faisait un upsert sans cleanup : si un ticker disparaissait
-- d'un export Wealthsimple (vente totale d'une position), la ligne `asset` restait
-- en BDD et continuait d'apparaître sur le dashboard — le portfolio "live" divergeait
-- de la réalité du courtier.
--
-- V5 introduit un lifecycle explicite :
--   - `status` ∈ {OPEN, CLOSED} : OPEN = position détenue à ce jour, CLOSED = position
--     soldée (n'apparaît plus dans le dernier import). Le dashboard filtre `OPEN`,
--     les futures vues "Positions historiques" Phase 4 liront les `CLOSED`.
--   - `opened_at` : première date d'apparition dans un import (≈ created_at, on backfill
--     avec `created_at` pour les rows existantes).
--   - `closed_at` : NULL tant qu'OPEN, set à la date de l'import qui a sorti le ticker.
--
-- Quand un ticker `CLOSED` réapparaît dans un import (rachat), `CsvImportService` le
-- réouvre : `status` redevient `OPEN` et `closed_at` repasse à NULL.
--
-- Les colonnes valeurs (`quantity`, `avg_buy_price`, `market_value`, etc.) sont **figées**
-- au moment du flip vers CLOSED — on garde la dernière snapshot connue de la position
-- pour la future page historique. Les snapshots `snapshot_position` restent par ailleurs
-- la source d'historique fidèle par batch.

ALTER TABLE asset
    ADD COLUMN status      VARCHAR(10)  NOT NULL DEFAULT 'OPEN',
    ADD COLUMN opened_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    ADD COLUMN closed_at   TIMESTAMPTZ  NULL;

-- Backfill : les rows existantes sont toutes considérées OPEN, et leur `opened_at`
-- prend la valeur de `created_at` (la date de premier import). `closed_at` reste NULL.
UPDATE asset
   SET opened_at = created_at
 WHERE opened_at IS NULL OR opened_at = now();

-- Index sur (portfolio_id, status) — toutes les query du dashboard filtrent par status,
-- donc autant lui donner un index couvrant.
CREATE INDEX idx_asset_portfolio_status ON asset(portfolio_id, status);
