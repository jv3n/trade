-- A stat carries several trades (#500), each created by hand : the FK keeps a plain index for the
-- stat → trades lookups.
DROP INDEX public.ux_trade_entry_stat_entry_id;
CREATE INDEX ix_trade_entry_stat_entry_id ON public.trade_entry USING btree (stat_entry_id);
