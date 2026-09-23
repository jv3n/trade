-- The flag of `V5` was named for the wrong direction (#369) : a ticked row has always meant more than
-- 20 % of the float held by institutions. Only the name changes, the stored values stay as they are.
ALTER TABLE public.stat_entry RENAME COLUMN low_institutions TO high_institutions;
