-- The GUS as a sequence (#713) : the push gets its time, and a last point closes it — the drop, the
-- lowest print after the push, before the close, with its time. Optional : the history has none, so
-- ck_stat_entry_completed_whole stays at the five prices.
ALTER TABLE public.stat_entry
    ADD COLUMN push_open_time time CONSTRAINT stat_entry_push_open_time_check CHECK (push_open_time BETWEEN '04:00' AND '20:00'),
    ADD COLUMN gus_drop_price numeric(18,4) CONSTRAINT stat_entry_gus_drop_price_check CHECK (gus_drop_price > 0),
    ADD COLUMN gus_drop_time  time CONSTRAINT stat_entry_gus_drop_time_check CHECK (gus_drop_time BETWEEN '04:00' AND '20:00');

-- The GUS session's own : a double top keeps none of the three.
ALTER TABLE public.stat_entry
    ADD CONSTRAINT ck_stat_entry_gus_sequence_on_gus CHECK (
        pattern <> 'DT' OR (push_open_time IS NULL AND gus_drop_price IS NULL AND gus_drop_time IS NULL)
    );

-- A « no push » day has no push, so no push time either.
ALTER TABLE public.stat_entry
    ADD CONSTRAINT ck_stat_entry_push_open_time_no_push CHECK (NOT no_push OR push_open_time IS NULL);

-- A pair : a drop price without its time would count in the drop's n and not in its duration (#706).
ALTER TABLE public.stat_entry
    ADD CONSTRAINT ck_stat_entry_gus_drop_paired CHECK ((gus_drop_price IS NULL) = (gus_drop_time IS NULL));

-- The drop is timed from the push's top, so it needs the push time — the bell on a no-push day.
ALTER TABLE public.stat_entry
    ADD CONSTRAINT ck_stat_entry_gus_drop_push_timed CHECK (
        gus_drop_price IS NULL OR no_push OR push_open_time IS NOT NULL
    );

-- The drop comes after the push, checked once both times are in.
ALTER TABLE public.stat_entry
    ADD CONSTRAINT ck_stat_entry_gus_drop_after_push CHECK (
        gus_drop_time IS NULL OR push_open_time IS NULL OR gus_drop_time >= push_open_time
    );
