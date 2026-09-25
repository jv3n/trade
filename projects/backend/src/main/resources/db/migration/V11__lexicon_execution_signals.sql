-- The terms the pattern sheets introduce (#417, `docs/notes/execution-signals.md`). SSR is already
-- there. `DO NOTHING` : a term an admin already added by hand keeps its own definition.
INSERT INTO public.lexicon_entry (term, definition_fr, definition_en) VALUES
  ('Penny Break',
   'Le titre casse un niveau (un top, un niveau de rebond) de pas plus d''environ 1 %, puis est rejeté aussitôt. Un signe de faiblesse qui sert d''entrée, lu sur le graphique 5 secondes',
   'The stock breaks a level (a top, a bounce level) by no more than about 1 %, then gets rejected at once. A sign of weakness used as an entry, read on the 5-second chart'),
  ('Four Sellers',
   'Les quatre sources de vente d''un short : les longs en profit, les longs à perte, les short sellers et les bag holders. Un trade en veut au moins trois sur quatre',
   'The four sources of selling behind a short : longs in profit, longs at a loss, short sellers and bag holders. A trade wants at least three of the four'),
  ('Bag Holder',
   'Trader coincé dans une position perdante à un niveau passé (pre-market ou daily), qui attend que le titre y retourne pour sortir',
   'Trader stuck in a losing position at a past level (premarket or daily), waiting for the stock to come back there to get out')
ON CONFLICT DO NOTHING;
