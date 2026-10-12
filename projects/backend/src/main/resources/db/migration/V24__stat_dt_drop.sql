-- The fifth point of a double top (#706) : the lowest print after the retest, before the close, and
-- its time — what the pattern paid. Optional : the history has none, so ck_stat_entry_completed_whole
-- stays at four prices and four times.
ALTER TABLE public.stat_entry
    ADD COLUMN dt_drop_price numeric(18,4) CONSTRAINT stat_entry_dt_drop_price_check CHECK (dt_drop_price > 0),
    ADD COLUMN dt_drop_time  time CONSTRAINT stat_entry_dt_drop_time_check CHECK (dt_drop_time BETWEEN '04:00' AND '20:00');

ALTER TABLE public.stat_entry DROP CONSTRAINT ck_stat_entry_dt_prices_on_dt;
ALTER TABLE public.stat_entry
    ADD CONSTRAINT ck_stat_entry_dt_prices_on_dt CHECK (
        pattern = 'DT'
        OR (dt_start_price IS NULL AND dt_top_price IS NULL AND dt_low_price IS NULL
            AND dt_retest_price IS NULL AND dt_drop_price IS NULL)
    );

ALTER TABLE public.stat_entry DROP CONSTRAINT ck_stat_entry_dt_times_on_dt;
ALTER TABLE public.stat_entry
    ADD CONSTRAINT ck_stat_entry_dt_times_on_dt CHECK (
        pattern = 'DT'
        OR (dt_start_time IS NULL AND dt_top_time IS NULL AND dt_low_time IS NULL
            AND dt_retest_time IS NULL AND dt_drop_time IS NULL)
    );

-- A pair : a drop price without its time would count in the drop's n and not in its duration.
ALTER TABLE public.stat_entry
    ADD CONSTRAINT ck_stat_entry_dt_drop_paired CHECK ((dt_drop_price IS NULL) = (dt_drop_time IS NULL));

-- The drop closes the sequence : after each of the four other times, checked once both are in.
ALTER TABLE public.stat_entry
    ADD CONSTRAINT ck_stat_entry_dt_drop_time_last CHECK (
        dt_drop_time IS NULL
        OR (dt_drop_time >= COALESCE(dt_retest_time, dt_low_time, dt_top_time, dt_start_time, dt_drop_time))
    );
