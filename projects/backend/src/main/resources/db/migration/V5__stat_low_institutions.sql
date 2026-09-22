-- « Institutions < 20 % » (#349) : less than a fifth of the float held by institutions, ticked by
-- hand from the broker screen. The threshold lives in the UI label, not here : it can move without
-- touching the stored flag.
ALTER TABLE public.stat_entry ADD COLUMN low_institutions boolean NOT NULL DEFAULT false;
