-- A double top is read off the session, not off the morning (#649) : it carries no premarket prices.
-- The other patterns still do, so their NOT NULL moves into a CHECK. The NOT NULL goes before the
-- UPDATE : clearing first is refused on any existing DT.
ALTER TABLE public.stat_entry
    ALTER COLUMN previous_close DROP NOT NULL,
    ALTER COLUMN pm_open DROP NOT NULL,
    ALTER COLUMN pm_high DROP NOT NULL;

UPDATE public.stat_entry SET previous_close = NULL, pm_open = NULL, pm_high = NULL WHERE pattern = 'DT';

ALTER TABLE public.stat_entry
    ADD CONSTRAINT ck_stat_entry_premarket_by_pattern CHECK (
        (pattern = 'DT' AND previous_close IS NULL AND pm_open IS NULL AND pm_high IS NULL)
        OR (pattern <> 'DT' AND previous_close IS NOT NULL AND pm_open IS NOT NULL AND pm_high IS NOT NULL)
    );
