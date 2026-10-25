-- Where a stat comes from (#762) : typed or promoted by hand, or dropped by the scanner (#760). A
-- scanner stat waits to be reviewed ; a manual one has nothing to review.
CREATE TYPE public.stat_source AS ENUM ('MANUAL', 'SCANNER');
CREATE TYPE public.stat_review AS ENUM ('TO_REVIEW', 'VALIDATED', 'REJECTED');
CREATE TYPE public.stat_rejection_reason AS ENUM (
    'BREAKOUT', 'WEAK_REJECTION', 'ECHO_TOO_FAR',
    'GAP_TOO_SMALL', 'NEWS', 'FLOAT_OUT_OF_RANGE',
    'NOISE', 'OTHER'
);

-- A rejected stat is kept : it stops a re-scan from bringing it back. Only a validated one is
-- ticked — validating says « this is the pattern », ticking « its figures are right ».
ALTER TABLE public.stat_entry
    ADD COLUMN source public.stat_source NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN review public.stat_review,
    ADD COLUMN rejection_reason public.stat_rejection_reason,
    ADD CONSTRAINT ck_stat_entry_review_on_scanner CHECK ((source = 'SCANNER') = (review IS NOT NULL)),
    ADD CONSTRAINT ck_stat_entry_rejection_reason_on_rejected CHECK (
        rejection_reason IS NULL OR review = 'REJECTED'
    ),
    -- A reason is of the stat's pattern : NOISE and OTHER of both, the rest of one only.
    ADD CONSTRAINT ck_stat_entry_rejection_reason_of_pattern CHECK (
        rejection_reason IS NULL
        OR rejection_reason IN ('NOISE', 'OTHER')
        OR (pattern = 'DT') = (rejection_reason IN ('BREAKOUT', 'WEAK_REJECTION', 'ECHO_TOO_FAR'))
    ),
    ADD CONSTRAINT ck_stat_entry_completed_reviewed CHECK (
        completed_at IS NULL OR review IS NULL OR review = 'VALIDATED'
    );
