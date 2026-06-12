-- Stats : open the dataset to per-user creation from the radar « Add stat » button.
--
-- Two shifts vs V1's import-only, all-required, global table :
--   1. Provenance + ownership — `source` tags how a row was created (admin CSV import vs user radar
--      pick) and `created_by` carries the owning user (NULL = the admin/global curated dataset). The
--      listing query filters on `created_by IS NULL OR created_by = :me` so a user sees the admin
--      rows + their own, never another user's.
--   2. Partial rows — a radar pick only knows ticker / gap / open price at scan time ; float,
--      institutions, the booleans and the EOD outcome (high / lod / eod + derived %) are unknown
--      until the day plays out. Those columns become NULLable so a partial row is stored as NULL
--      rather than a misleading 0. `trade_date`, `ticker`, `gap_up_percent` and `open_price` stay
--      NOT NULL — always known when a row is created (radar or CSV).
--
-- The existing `CHECK (... > 0)` constraints are kept as-is : in Postgres a CHECK evaluates to
-- unknown (→ pass) on a NULL value, so they keep guarding non-null inserts without rejecting partials.

ALTER TABLE stat_entry
    ALTER COLUMN float_shares_millions DROP NOT NULL,
    ALTER COLUMN institutions_percent  DROP NOT NULL,
    ALTER COLUMN inst_over_20          DROP NOT NULL,
    ALTER COLUMN under_1_dollar        DROP NOT NULL,
    ALTER COLUMN ssr                   DROP NOT NULL,
    ALTER COLUMN entry_after_11am      DROP NOT NULL,
    ALTER COLUMN high_price            DROP NOT NULL,
    ALTER COLUMN lod_price             DROP NOT NULL,
    ALTER COLUMN eod_price             DROP NOT NULL,
    ALTER COLUMN push_percent          DROP NOT NULL,
    ALTER COLUMN lod_percent           DROP NOT NULL,
    ALTER COLUMN eod_percent           DROP NOT NULL;

ALTER TABLE stat_entry
    ADD COLUMN source     VARCHAR(16) NOT NULL DEFAULT 'IMPORT' CHECK (source IN ('IMPORT', 'RADAR')),
    ADD COLUMN created_by UUID        NULL REFERENCES app_user(id) ON DELETE CASCADE;

-- Drives the per-user visibility filter (`created_by IS NULL OR created_by = :me`).
CREATE INDEX idx_stat_entry_created_by ON stat_entry(created_by);
