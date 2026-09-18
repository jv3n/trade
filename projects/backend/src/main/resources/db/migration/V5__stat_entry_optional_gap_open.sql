-- Relax the stat form to "only date + ticker required" (parity with the journal trade form).
--
-- gap_up_percent and open_price were the last mandatory scan-time fields ; the manual « Add » dialog
-- can now omit them (jot a ticker for the day, flesh it out later). The community CSV import path
-- still always provides them — this only widens what the form accepts. The CHECK on open_price stays
-- (a CHECK passes when its expression is NULL, so dropping NOT NULL is enough).

ALTER TABLE stat_entry
    ALTER COLUMN gap_up_percent DROP NOT NULL,
    ALTER COLUMN open_price     DROP NOT NULL;
