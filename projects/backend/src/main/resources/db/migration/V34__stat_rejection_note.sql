-- The words of a rejection (#787) : the case the reason only names, what the detectors get tuned on.
ALTER TABLE public.stat_entry
    ADD COLUMN rejection_note text,
    ADD CONSTRAINT ck_stat_entry_rejection_note_on_rejected CHECK (
        rejection_note IS NULL OR review = 'REJECTED'
    ),
    ADD CONSTRAINT ck_stat_entry_rejection_note_length CHECK (char_length(rejection_note) <= 500);
