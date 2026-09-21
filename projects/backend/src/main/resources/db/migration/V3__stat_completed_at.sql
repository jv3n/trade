-- A stat is completed when its owner ticks it (#263), no longer as soon as its five session prices
-- are in. The stats already complete keep their status ; the CHECK keeps a ticked stat whole.
ALTER TABLE public.stat_entry ADD COLUMN completed_at timestamp with time zone;

UPDATE public.stat_entry
SET completed_at = updated_at
WHERE open_price IS NOT NULL
  AND push_open_price IS NOT NULL
  AND hod_price IS NOT NULL
  AND lod_price IS NOT NULL
  AND eod_price IS NOT NULL;

ALTER TABLE public.stat_entry
    ADD CONSTRAINT ck_stat_entry_completed_whole CHECK (
        completed_at IS NULL
        OR (open_price IS NOT NULL AND push_open_price IS NOT NULL AND hod_price IS NOT NULL
            AND lod_price IS NOT NULL AND eod_price IS NOT NULL)
    );
