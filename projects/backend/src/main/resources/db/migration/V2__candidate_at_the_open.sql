-- « À l'open » card (#261) : the session open typed at 9:30 (carried over to the stat on promotion)
-- and the push aimed at for that candidate (null = follows the reference picked on the card).
ALTER TABLE public.candidate
    ADD COLUMN open_price numeric(18,4),
    ADD COLUMN target_push_percent numeric(7,2),
    ADD CONSTRAINT candidate_open_price_check CHECK ((open_price > (0)::numeric)),
    ADD CONSTRAINT candidate_target_push_percent_check CHECK ((target_push_percent >= (0)::numeric));
