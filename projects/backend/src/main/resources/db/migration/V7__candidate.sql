-- Candidates module (Phase 2) : short-trade preparation cockpit, one row per ticker the trader sets
-- up for a session. Scoped by user_id (no separate aggregate table). The lifecycle is DATE-DRIVEN —
-- `trading_date` decides dropdown visibility (today = active, past = closed / kept for history), so
-- there is no status column by design.
--
-- Percentages are stored as whole numbers (5.00 = 5 %, 40.00 = 40 %) ; the front converts to a
-- fraction where the math needs it. Prices use NUMERIC(18, 4), capital NUMERIC(18, 2).
--
-- `fills`, `entries` and `exits` are low-cardinality, candidate-local arrays → they ride as JSONB
-- rather than child tables ; the application marshals them to/from typed objects (Hibernate maps them
-- as String via @JdbcTypeCode(JSON), same convention as screener_snapshot_day.movers /
-- ticker_narrative_snapshot). `fills` = shares short per fixed ladder rung (sizing) ; `entries` =
-- free-form short entry legs (price + shares) whose weighted average is the average short position ;
-- `exits` = cover legs. Derived figures (ladder, totals, residual, gains) are never stored —
-- recomputed client-side from these inputs.

CREATE TABLE candidate (
    id                     UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID            NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    trading_date           DATE            NOT NULL,
    ticker                 VARCHAR(20)     NOT NULL,
    total_capital          NUMERIC(18, 2)  NOT NULL CHECK (total_capital > 0),
    pct_capital_at_risk    NUMERIC(6, 2)   NOT NULL CHECK (pct_capital_at_risk > 0 AND pct_capital_at_risk <= 100),
    open_price             NUMERIC(18, 4)  NOT NULL CHECK (open_price > 0),
    stop_pct               NUMERIC(6, 2),
    previous_close         NUMERIC(18, 4),
    float_shares           NUMERIC(18, 2),
    volume                 NUMERIC(18, 2),
    morning_push           NUMERIC(18, 4),
    borrow_cost_per_share  NUMERIC(18, 4),
    fills                  JSONB           NOT NULL DEFAULT '[]',
    entries                JSONB           NOT NULL DEFAULT '[]',
    exits                  JSONB           NOT NULL DEFAULT '[]',
    note                   VARCHAR(2000),
    created_at             TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- Dropdown query : a user's candidates for a given session, newest sessions first.
CREATE INDEX idx_candidate_user_date ON candidate (user_id, trading_date DESC);
