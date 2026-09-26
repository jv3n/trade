-- One stat per pattern (#434). A candidate is no longer assigned to a pattern : the pattern is chosen
-- when promoting, and one candidate can give one stat per pattern — a GUS in the morning, a double
-- top late in the morning.
ALTER TABLE public.candidate DROP COLUMN pattern;

ALTER TABLE public.stat_entry DROP CONSTRAINT ux_stat_entry_user_day_ticker;
ALTER TABLE public.stat_entry
    ADD CONSTRAINT ux_stat_entry_user_day_ticker_pattern UNIQUE (user_id, trade_date, ticker, pattern);

-- One stat per candidate and pattern, held by the database (#392). Leads with candidate_id, so it
-- also serves the lookups the plain index did.
DROP INDEX public.idx_stat_entry_candidate;
CREATE UNIQUE INDEX ux_stat_entry_candidate_pattern
    ON public.stat_entry (candidate_id, pattern) WHERE candidate_id IS NOT NULL;
