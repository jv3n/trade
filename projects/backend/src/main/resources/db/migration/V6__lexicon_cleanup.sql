-- Lexicon clean-up (#314). The glossary is read by its **heading** — the acronym when the term
-- carries one — so entries that collide on a heading or say the same thing are noise.

-- Two terms rendered « EOD » and two rendered « LOD ». The averages are figures the stats sheet
-- computes, not vocabulary of the trading day : the plain terms stay, the averages go.
DELETE FROM public.lexicon_entry
WHERE term IN ('Average End of Day (EOD)', 'Average Low of Day (LOD)');

-- Same definition, word for word, under two terms. « % of Total Equity @ Risk » is the wording of
-- the broker screen, so it is the one kept ; the other was its duplicate.
DELETE FROM public.lexicon_entry WHERE term = '% Capital at risk';

-- GUS carried its expansion where its definition should be — and it is the pattern the whole app
-- is built around (cf. `docs/pattern/GUS.md`).
UPDATE public.lexicon_entry
SET term = 'Gap Up Short (GUS)',
    definition_fr = 'Shorter un titre qui ouvre en forte hausse en premarket sans fondamental derrière, en pariant sur le retour du prix pendant la séance',
    definition_en = 'Shorting a stock that gapped up in premarket with no fundamental behind it, betting on the price falling back during the session'
WHERE term = 'GUS';
