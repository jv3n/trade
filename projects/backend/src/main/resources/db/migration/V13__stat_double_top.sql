-- The double top stat (#435). A DT is measured by its four prices, not by the GUS session : start of
-- the push, top, low of the rejection, high of the retest. Columns rather than a table of their own,
-- so that the CHECK below can still keep a ticked stat whole, pattern by pattern.
ALTER TABLE public.stat_entry
    ADD COLUMN dt_start_price  numeric(18,4) CONSTRAINT stat_entry_dt_start_price_check CHECK (dt_start_price > 0),
    ADD COLUMN dt_top_price    numeric(18,4) CONSTRAINT stat_entry_dt_top_price_check CHECK (dt_top_price > 0),
    ADD COLUMN dt_low_price    numeric(18,4) CONSTRAINT stat_entry_dt_low_price_check CHECK (dt_low_price > 0),
    ADD COLUMN dt_retest_price numeric(18,4) CONSTRAINT stat_entry_dt_retest_price_check CHECK (dt_retest_price > 0);

ALTER TABLE public.stat_entry
    ADD CONSTRAINT ck_stat_entry_dt_prices_on_dt CHECK (
        pattern = 'DT'
        OR (dt_start_price IS NULL AND dt_top_price IS NULL AND dt_low_price IS NULL AND dt_retest_price IS NULL)
    );

-- A stat re-filed as DT before this migration (#393) was ticked on the GUS session, which no longer
-- says anything about it : back to "to complete", its four DT prices are still to type.
UPDATE public.stat_entry SET completed_at = NULL WHERE pattern = 'DT';

ALTER TABLE public.stat_entry DROP CONSTRAINT ck_stat_entry_completed_whole;
ALTER TABLE public.stat_entry
    ADD CONSTRAINT ck_stat_entry_completed_whole CHECK (
        completed_at IS NULL
        OR (pattern = 'DT'
            AND dt_start_price IS NOT NULL AND dt_top_price IS NOT NULL
            AND dt_low_price IS NOT NULL AND dt_retest_price IS NOT NULL)
        OR (pattern <> 'DT'
            AND open_price IS NOT NULL AND (push_open_price IS NOT NULL OR no_push)
            AND hod_price IS NOT NULL AND lod_price IS NOT NULL AND eod_price IS NOT NULL)
    );
