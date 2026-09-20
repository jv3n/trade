-- One trade per stat at most (#193).
--
-- A trade is born from a stat and there is no way to create a second one from the same stat : the
-- « → Trade » action turns into a link to the existing trade as soon as one exists. The service
-- checks it first for a clean 409 ; this index is the race-safe backstop, and it replaces the plain
-- lookup index created with the column (V4) — a unique index serves the same reads.

DROP INDEX idx_trade_entry_stat_entry_id;

CREATE UNIQUE INDEX ux_trade_entry_stat_entry_id ON trade_entry(stat_entry_id);
