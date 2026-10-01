-- A checkbox survives only if the app cannot derive it (#499). « Price < $1 » restated the open and
-- was wrong on a third of the stats : it is derived from the price now.
ALTER TABLE public.stat_entry DROP COLUMN under_1_dollar;
-- « Entry after 11 am » is derived from the retest time on a double top ; the box ticked there is
-- ignored from now on, so it is cleared rather than left to say something else.
UPDATE public.stat_entry SET entry_after_11am = false WHERE pattern = 'DT';
