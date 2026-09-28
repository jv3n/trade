-- The four moments of a double top (#469) : a wall-clock time next to each DT price, on the stat's own
-- trade date — no timezone in the schema. Bounded to TradeZero's extended session (04:00-20:00) : a
-- premarket double top is real, a 02:10 is a typo.
ALTER TABLE public.stat_entry
    ADD COLUMN dt_start_time  time CONSTRAINT stat_entry_dt_start_time_check  CHECK (dt_start_time  BETWEEN '04:00' AND '20:00'),
    ADD COLUMN dt_top_time    time CONSTRAINT stat_entry_dt_top_time_check    CHECK (dt_top_time    BETWEEN '04:00' AND '20:00'),
    ADD COLUMN dt_low_time    time CONSTRAINT stat_entry_dt_low_time_check    CHECK (dt_low_time    BETWEEN '04:00' AND '20:00'),
    ADD COLUMN dt_retest_time time CONSTRAINT stat_entry_dt_retest_time_check CHECK (dt_retest_time BETWEEN '04:00' AND '20:00');

ALTER TABLE public.stat_entry
    ADD CONSTRAINT ck_stat_entry_dt_times_on_dt CHECK (
        pattern = 'DT'
        OR (dt_start_time IS NULL AND dt_top_time IS NULL AND dt_low_time IS NULL AND dt_retest_time IS NULL)
    );

-- start <= top <= low <= retest, each pair checked once both are in : a negative leg is a typo, and
-- would make the durations' median meaningless.
ALTER TABLE public.stat_entry
    ADD CONSTRAINT ck_stat_entry_dt_times_in_order CHECK (
        (dt_start_time IS NULL OR dt_top_time    IS NULL OR dt_start_time <= dt_top_time)
        AND (dt_start_time IS NULL OR dt_low_time    IS NULL OR dt_start_time <= dt_low_time)
        AND (dt_start_time IS NULL OR dt_retest_time IS NULL OR dt_start_time <= dt_retest_time)
        AND (dt_top_time   IS NULL OR dt_low_time    IS NULL OR dt_top_time   <= dt_low_time)
        AND (dt_top_time   IS NULL OR dt_retest_time IS NULL OR dt_top_time   <= dt_retest_time)
        AND (dt_low_time   IS NULL OR dt_retest_time IS NULL OR dt_low_time   <= dt_retest_time)
    );

-- A ticked double top now needs its four times too. Production holds none ; any other database
-- sends its ticked DTs back to "to complete", their times still to type.
UPDATE public.stat_entry SET completed_at = NULL WHERE pattern = 'DT' AND completed_at IS NOT NULL;

ALTER TABLE public.stat_entry DROP CONSTRAINT ck_stat_entry_completed_whole;
ALTER TABLE public.stat_entry
    ADD CONSTRAINT ck_stat_entry_completed_whole CHECK (
        completed_at IS NULL
        OR (pattern = 'DT'
            AND dt_start_price IS NOT NULL AND dt_top_price IS NOT NULL
            AND dt_low_price IS NOT NULL AND dt_retest_price IS NOT NULL
            AND dt_start_time IS NOT NULL AND dt_top_time IS NOT NULL
            AND dt_low_time IS NOT NULL AND dt_retest_time IS NOT NULL)
        OR (pattern <> 'DT'
            AND open_price IS NOT NULL AND (push_open_price IS NOT NULL OR no_push)
            AND hod_price IS NOT NULL AND lod_price IS NOT NULL AND eod_price IS NOT NULL)
    );
