-- The double top's drop is required to tick (#710) — unless the retest took the top : a breakout,
-- no drop to measure ; and only from 2026-10-12, the first day it was recorded (#726,
-- StatEntry.DT_DROP_SINCE) : an earlier DT is complete without it. One ticked since without its
-- drop is incomplete under the rule : back to « to complete », so the constraint cannot fail.
UPDATE public.stat_entry SET completed_at = NULL
 WHERE pattern = 'DT' AND completed_at IS NOT NULL
   AND trade_date >= DATE '2026-10-12'
   AND dt_retest_price < dt_top_price
   AND (dt_drop_price IS NULL OR dt_drop_time IS NULL);

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
                 OR (dt_drop_price IS NOT NULL AND dt_drop_time IS NOT NULL)))
        OR (pattern <> 'DT'
            AND open_price IS NOT NULL AND (push_open_price IS NOT NULL OR no_push)
            AND hod_price IS NOT NULL AND lod_price IS NOT NULL AND eod_price IS NOT NULL)
    );
