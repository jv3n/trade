-- =============================================================================
-- Watchlist : persister `instrument_type` au moment du POST add
-- =============================================================================
--
-- Friction 2026-05-09 : le dashboard faisait un `getTicker(symbol)` parallèle
-- par entrée watchlist au mount pour récupérer le type d'instrument et rendre
-- le chip. Chaque `getTicker` côté backend = 1 `fetchChart` = 2 credits Twelve
-- Data (`/time_series` + `/quote`). Avec une watchlist de 5+ entrées + cache
-- vide, c'était 10+ credits en burst < 1 sec → ban immédiat sur free tier
-- (8 credits/min).
--
-- Fix : on persiste le `instrument_type` au moment de l'add, le frontend lit
-- directement le DTO sans avoir à interroger la chart à chaque mount.
--
-- Pas de backfill auto : les enums `AssetType` (portefeuille) et
-- `InstrumentType` (market, ce que stocke cette colonne) sont distincts —
-- AssetType a BOND/COMMODITY/CRYPTO qui n'existent pas dans InstrumentType,
-- et InstrumentType a INDEX qui n'existe pas dans AssetType. Un mapping
-- naïf risquerait de faire mentir les chips. Les entries existantes restent
-- avec NULL → pas de chip rendu côté front (degrade closed, comportement
-- déjà en place pour les lookups failed). Le user peut re-add s'il veut le
-- chip.

ALTER TABLE watchlist_entry
    ADD COLUMN instrument_type VARCHAR(20);
