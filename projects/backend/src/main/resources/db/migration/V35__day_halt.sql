-- The halts read off a day's 1-min bars (#829), keyed like the bars : a GUS and a DT of one
-- ticker-day share them, and they go with the bars they were read from.
CREATE TABLE day_halt (
    id            UUID           PRIMARY KEY,
    trading_date  DATE           NOT NULL,
    ticker        VARCHAR(20)    NOT NULL,
    halted_at     TIMESTAMPTZ    NOT NULL,
    reopened_at   TIMESTAMPTZ    NOT NULL,
    last_close    NUMERIC(14, 6) NOT NULL,
    reopen_price  NUMERIC(14, 6) NOT NULL,
    CONSTRAINT ux_day_halt_day_ticker_time UNIQUE (trading_date, ticker, halted_at),
    CONSTRAINT fk_day_halt_day_bars FOREIGN KEY (trading_date, ticker)
        REFERENCES day_bars (trading_date, ticker) ON DELETE CASCADE,
    CONSTRAINT ck_day_halt_order CHECK (reopened_at > halted_at)
);

-- Bars are gzipped, so SQL cannot read the days already stored : `DayHaltsBackfill` does, at startup.
ALTER TABLE day_bars ADD COLUMN halts_read BOOLEAN NOT NULL DEFAULT FALSE;
