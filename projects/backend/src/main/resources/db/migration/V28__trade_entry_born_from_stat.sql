-- Whether a trade was created from its stat (« → Trade ») or attached to it — at its creation, when
-- the stat came later, or on an edit (#735). Only the first one reads « created from the stat ».
ALTER TABLE public.trade_entry
    ADD COLUMN born_from_stat BOOLEAN NOT NULL DEFAULT false,
    ADD CONSTRAINT ck_trade_entry_born_from_stat CHECK (NOT born_from_stat OR stat_entry_id IS NOT NULL);

-- The history is inferred once : a trade created after its stat was born from it. A trade typed on
-- its own after #732 on a triple that already had a stat reads as born too — the only miss.
UPDATE public.trade_entry t
   SET born_from_stat = true
  FROM public.stat_entry s
 WHERE t.stat_entry_id = s.id
   AND t.created_at >= s.created_at;
