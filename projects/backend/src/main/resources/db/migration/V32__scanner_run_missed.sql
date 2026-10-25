-- The tickers a run could not read (#779) : the run went on without them, so it is partial, not
-- failed — `error` stays for a run that read nothing. Comma-separated, null when none was missed.
ALTER TABLE scanner_run ADD COLUMN missed_tickers VARCHAR(2000);
