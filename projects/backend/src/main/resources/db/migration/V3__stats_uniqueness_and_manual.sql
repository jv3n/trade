-- Stats : add the MANUAL provenance + enforce one analysis per (day, ticker, owner).
--
-- Provenance now has three origins (cf. `StatSource`) :
--   • IMPORT — the ADMIN CSV import (community dataset, `created_by` NULL, arrives end of month).
--   • RADAR  — a one-click « Add stat » from the market radar.
--   • MANUAL — a row typed by hand in the stats « Add » dialog.
-- RADAR + MANUAL are owned by their creator ; IMPORT is the shared global set.
--
-- Uniqueness is **per owner**, not global : a user's own analysis (radar/manual) for GELS on a given
-- day and the community IMPORT analysis for the same GELS/day **must coexist** — that's the whole point
-- (compare your read vs the community's, KPI-wise, later). So the unique key is
-- (trade_date, ticker, created_by). Postgres treats NULLs as distinct in a plain unique index, which
-- would let multiple IMPORT rows (created_by NULL) duplicate ; we COALESCE NULL to a fixed zero-uuid
-- sentinel so the admin/global set is *also* capped at one row per (day, ticker). This expression index
-- works on every PG version (no `NULLS NOT DISTINCT`, which is PG15+).

ALTER TABLE stat_entry
    DROP CONSTRAINT stat_entry_source_check,
    ADD CONSTRAINT stat_entry_source_check CHECK (source IN ('IMPORT', 'RADAR', 'MANUAL'));

-- Defensive dedup before the unique index : early testing could have created duplicate radar picks
-- for the same (day, ticker, owner). Keep the freshest row of each group (latest created_at, id as a
-- stable tiebreaker), drop the rest, so the index can be built.
DELETE FROM stat_entry s
USING (
    SELECT id,
           row_number() OVER (
               PARTITION BY trade_date, ticker,
                            COALESCE(created_by, '00000000-0000-0000-0000-000000000000'::uuid)
               ORDER BY created_at DESC, id DESC
           ) AS rn
    FROM stat_entry
) ranked
WHERE s.id = ranked.id AND ranked.rn > 1;

CREATE UNIQUE INDEX ux_stat_entry_day_ticker_owner
    ON stat_entry (trade_date, ticker,
                   COALESCE(created_by, '00000000-0000-0000-0000-000000000000'::uuid));
