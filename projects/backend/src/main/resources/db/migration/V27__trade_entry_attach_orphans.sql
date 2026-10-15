-- A trade typed before its stat used to stay on its own (#732) : every one already on the day,
-- ticker and pattern of a stat joins it, as a new trade or a new stat now does.
UPDATE public.trade_entry t
   SET stat_entry_id = s.id, updated_at = now()
  FROM public.stat_entry s
 WHERE t.stat_entry_id IS NULL
   AND s.user_id = t.user_id
   AND s.trade_date = t.trade_date
   AND s.ticker = t.ticker
   AND s.pattern = t.pattern;
