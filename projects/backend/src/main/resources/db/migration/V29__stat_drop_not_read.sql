-- A Sink marked as not read (#729) : the owner says the figure was not read and will not be. It
-- records the observer, never the market — and never sits beside a typed Sink.
ALTER TABLE public.stat_entry
    ADD COLUMN drop_not_read BOOLEAN NOT NULL DEFAULT false,
    ADD CONSTRAINT ck_stat_entry_drop_not_read CHECK (
        NOT drop_not_read
        OR (gus_drop_price IS NULL AND gus_drop_time IS NULL
            AND dt_drop_price IS NULL AND dt_drop_time IS NULL)
    );

-- A double top whose Sink is not read is whole with its four points, like one recorded before the
-- Sink was asked.
ALTER TABLE public.stat_entry DROP CONSTRAINT ck_stat_entry_completed_whole;
ALTER TABLE public.stat_entry
    ADD CONSTRAINT ck_stat_entry_completed_whole CHECK (
        completed_at IS NULL
        OR (pattern = 'DT'
            AND dt_start_price IS NOT NULL AND dt_top_price IS NOT NULL
            AND dt_low_price IS NOT NULL AND dt_retest_price IS NOT NULL
            AND dt_start_time IS NOT NULL AND dt_top_time IS NOT NULL
            AND dt_low_time IS NOT NULL AND dt_retest_time IS NOT NULL
            AND (dt_retest_price >= dt_top_price
                 OR trade_date < DATE '2026-10-12'
                 OR drop_not_read
                 OR (dt_drop_price IS NOT NULL AND dt_drop_time IS NOT NULL)))
        OR (pattern <> 'DT'
            AND open_price IS NOT NULL AND (push_open_price IS NOT NULL OR no_push)
            AND hod_price IS NOT NULL AND lod_price IS NOT NULL AND eod_price IS NOT NULL)
    );
