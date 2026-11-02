-- Two writes on the same row, in two tabs, kept the last one without a word (#864).
ALTER TABLE public.stat_entry
    ADD COLUMN version bigint NOT NULL DEFAULT 0;

ALTER TABLE public.account_movement
    ADD COLUMN version bigint NOT NULL DEFAULT 0;
