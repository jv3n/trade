-- A trading day's 1-min bars for one ticker (#784), the chart of every stat of that day and ticker :
-- a GUS and a DT of the same ticker-day share them, so they are keyed by (day, ticker), not by stat.
-- Market data, the same for every user ; a stat's owner reads them through the stat. ts-scanner
-- pushes them — trade calls no provider. No row : not fetched yet.
CREATE TYPE public.day_bars_status AS ENUM ('FOUND', 'NOT_FOUND');

CREATE TABLE day_bars (
    id            UUID                   PRIMARY KEY,
    trading_date  DATE                   NOT NULL,
    ticker        VARCHAR(20)            NOT NULL,
    status        public.day_bars_status NOT NULL,
    -- Gzipped text, one bar a line : a day is always read whole (~960 bars, ~10 KB).
    bars          BYTEA,
    bar_count     INTEGER                NOT NULL CHECK (bar_count >= 0),
    fetched_at    TIMESTAMPTZ            NOT NULL,
    CONSTRAINT ux_day_bars_day_ticker UNIQUE (trading_date, ticker),
    CONSTRAINT ck_day_bars_found_has_bars CHECK ((status = 'FOUND') = (bars IS NOT NULL AND bar_count > 0))
);
