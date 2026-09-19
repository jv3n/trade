-- Shared pattern enum (#184) — candidates, stats and trades are all tagged with a pattern.
-- Replaces the journal-only `trade_pattern` (GUS / FRD) with `pattern` (GUS / DT / DISCRETIONARY).
--
-- The database restarts empty for the redesign, but the conversion stays safe on an existing one :
-- a leftover FRD trade becomes DISCRETIONARY, a trade without a pattern becomes GUS.

CREATE TYPE pattern AS ENUM ('GUS', 'DT', 'DISCRETIONARY');

ALTER TABLE trade_entry
    ALTER COLUMN pattern TYPE pattern
        USING (CASE pattern::text WHEN 'FRD' THEN 'DISCRETIONARY' ELSE pattern::text END)::pattern;

-- GUS is the default pattern ; every trade now carries one.
UPDATE trade_entry SET pattern = 'GUS' WHERE pattern IS NULL;

ALTER TABLE trade_entry
    ALTER COLUMN pattern SET DEFAULT 'GUS',
    ALTER COLUMN pattern SET NOT NULL;

DROP TYPE trade_pattern;
