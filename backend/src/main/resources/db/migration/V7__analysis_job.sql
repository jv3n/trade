CREATE TABLE analysis_job (
    id              UUID        PRIMARY KEY,
    portfolio_id    UUID        NOT NULL REFERENCES portfolio(id),
    status          VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    recommendation_id UUID      REFERENCES recommendation(id),
    error           TEXT
);

CREATE INDEX idx_analysis_job_portfolio_status ON analysis_job(portfolio_id, status);
