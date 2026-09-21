-- « No push » (#302) : the stock never pushed after the open. Such a stat has no push price and is
-- completed with the four other session prices, so the completed-whole CHECK lets it through.
ALTER TABLE public.stat_entry ADD COLUMN no_push boolean NOT NULL DEFAULT false;

ALTER TABLE public.stat_entry
    ADD CONSTRAINT ck_stat_entry_no_push_without_price CHECK (NOT no_push OR push_open_price IS NULL);

ALTER TABLE public.stat_entry DROP CONSTRAINT ck_stat_entry_completed_whole;

ALTER TABLE public.stat_entry
    ADD CONSTRAINT ck_stat_entry_completed_whole CHECK (
        completed_at IS NULL
        OR (open_price IS NOT NULL AND (push_open_price IS NOT NULL OR no_push)
            AND hod_price IS NOT NULL AND lod_price IS NOT NULL AND eod_price IS NOT NULL)
    );
