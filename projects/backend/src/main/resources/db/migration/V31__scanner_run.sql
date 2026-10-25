-- Each run of ts-scanner over a trading day (#763), reported by the scanner itself : the Today page
-- says when it last ran, on which day and what it found — amber when it failed or did not run.
CREATE TABLE scanner_run (
    id               UUID        PRIMARY KEY,
    user_id          UUID        NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    trading_date     DATE        NOT NULL,
    started_at       TIMESTAMPTZ NOT NULL,
    finished_at      TIMESTAMPTZ,
    tickers_scanned  INTEGER     NOT NULL CHECK (tickers_scanned >= 0),
    gus_found        INTEGER     NOT NULL CHECK (gus_found >= 0),
    dt_found         INTEGER     NOT NULL CHECK (dt_found >= 0),
    error            VARCHAR(2000),
    created_at       TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_scanner_run_finished_after_start CHECK (finished_at IS NULL OR finished_at >= started_at)
);

CREATE INDEX ix_scanner_run_user_started ON scanner_run (user_id, started_at DESC);
