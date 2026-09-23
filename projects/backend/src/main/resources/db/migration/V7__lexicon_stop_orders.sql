-- The stop variants borrowed the acronym of the plain order, so the glossary showed two « LMT » and
-- two « MKT » cards with different definitions (#364). The broker writes them `STP LMT` / `STP MKT`.
UPDATE public.lexicon_entry SET term = 'Stop-Limit (STP LMT)' WHERE term = 'Stop-Limit (LMT)';
UPDATE public.lexicon_entry SET term = 'Stop-Market (STP MKT)' WHERE term = 'Stop-Market (MKT)';
