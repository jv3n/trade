CREATE TYPE trade_play AS ENUM ('A', 'B');
CREATE TYPE trade_pattern AS ENUM ('GUS', 'FRD');
CREATE TYPE trade_open_side AS ENUM ('FRONT', 'BACK');
CREATE TYPE trade_exit_strategy AS ENUM ('SWING_20', 'EOD');


CREATE TABLE app_user (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    display_name  VARCHAR(255),
    provider      VARCHAR(50)  NOT NULL,
    provider_id   VARCHAR(255),
    role          VARCHAR(20)  NOT NULL CHECK (role IN ('ADMIN', 'USER')),
    last_login_at TIMESTAMPTZ,
    theme         VARCHAR(20)  NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
    language      VARCHAR(5)   NOT NULL DEFAULT 'fr'   CHECK (language IN ('fr', 'en')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);


CREATE TABLE app_config (
    config_key   VARCHAR(100) PRIMARY KEY,
    config_value TEXT         NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);


CREATE TABLE trade_entry (
    id                  UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID                  NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    trade_date          DATE                  NOT NULL,
    ticker              VARCHAR(20)           NOT NULL,
    play                trade_play            NOT NULL,
    pattern             trade_pattern         NOT NULL,
    size                INTEGER               NOT NULL CHECK (size > 0),
    open_price          NUMERIC(18, 4)        NOT NULL CHECK (open_price > 0),
    exit_price          NUMERIC(18, 4)                 CHECK (exit_price IS NULL OR exit_price > 0),
    profit_dollars      NUMERIC(18, 2),
    gain_percent        NUMERIC(8, 4),
    note                VARCHAR(2000),
    pre_9h35_to_10h     BOOLEAN,
    pre_gap_up_50       BOOLEAN,
    pre_price_1_to_10   BOOLEAN,
    pre_float_3_to_50m  BOOLEAN,
    pre_wait_push       BOOLEAN,
    open_side           trade_open_side,
    short_on_resistance BOOLEAN,
    exit_strategy       trade_exit_strategy,
    error_note          VARCHAR(2000),
    created_at          TIMESTAMPTZ           NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ           NOT NULL DEFAULT now()
);

CREATE INDEX idx_trade_entry_user_date ON trade_entry(user_id, trade_date DESC);
CREATE INDEX idx_trade_entry_ticker    ON trade_entry(ticker);

CREATE OR REPLACE FUNCTION trade_entry_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trade_entry_set_updated_at
BEFORE UPDATE ON trade_entry
FOR EACH ROW EXECUTE FUNCTION trade_entry_touch_updated_at();


CREATE TABLE stat_entry (
    id                    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_date            DATE           NOT NULL,
    ticker                VARCHAR(20)    NOT NULL,
    gap_up_percent        NUMERIC(8, 2)  NOT NULL,
    float_shares_millions NUMERIC(12, 2) NOT NULL CHECK (float_shares_millions > 0),
    institutions_percent  NUMERIC(5, 2)  NOT NULL CHECK (institutions_percent >= 0),
    inst_over_20          BOOLEAN        NOT NULL,
    under_1_dollar        BOOLEAN        NOT NULL,
    ssr                   BOOLEAN        NOT NULL,
    entry_after_11am      BOOLEAN        NOT NULL,
    note                  VARCHAR(2000),
    open_price            NUMERIC(18, 4) NOT NULL CHECK (open_price > 0),
    high_price            NUMERIC(18, 4) NOT NULL CHECK (high_price > 0),
    lod_price             NUMERIC(18, 4) NOT NULL CHECK (lod_price > 0),
    eod_price             NUMERIC(18, 4) NOT NULL CHECK (eod_price > 0),
    push_percent          NUMERIC(8, 2)  NOT NULL,
    lod_percent           NUMERIC(8, 2)  NOT NULL,
    eod_percent           NUMERIC(8, 2)  NOT NULL,
    created_at            TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX idx_stat_entry_ticker     ON stat_entry(ticker);
CREATE INDEX idx_stat_entry_trade_date ON stat_entry(trade_date DESC);

CREATE OR REPLACE FUNCTION stat_entry_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stat_entry_set_updated_at
BEFORE UPDATE ON stat_entry
FOR EACH ROW EXECUTE FUNCTION stat_entry_touch_updated_at();


CREATE TABLE lexicon_entry (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    term          VARCHAR(120) NOT NULL,
    definition_fr TEXT         NOT NULL,
    definition_en TEXT         NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_lexicon_entry_term ON lexicon_entry (lower(term));

CREATE OR REPLACE FUNCTION lexicon_entry_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lexicon_entry_set_updated_at
BEFORE UPDATE ON lexicon_entry
FOR EACH ROW EXECUTE FUNCTION lexicon_entry_touch_updated_at();


CREATE TABLE watchlist_entry (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    symbol          VARCHAR(20) NOT NULL,
    added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    instrument_type VARCHAR(20),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT watchlist_entry_user_symbol_key UNIQUE (user_id, symbol)
);

CREATE INDEX idx_watchlist_symbol ON watchlist_entry(symbol);
CREATE INDEX idx_watchlist_user   ON watchlist_entry(user_id);


CREATE TABLE prompt_template (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL,
    version       VARCHAR(50)  NOT NULL,
    system_prompt TEXT         NOT NULL,
    user_template TEXT,
    target_model  VARCHAR(100),
    is_active     BOOLEAN      NOT NULL DEFAULT FALSE,
    activated_at  TIMESTAMPTZ,
    deprecated_at TIMESTAMPTZ,
    notes         TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_prompt_template_active_per_name
    ON prompt_template(name) WHERE is_active = TRUE;


CREATE TABLE ticker_narrative_snapshot (
    id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol             VARCHAR(20)   NOT NULL,
    generated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    price              NUMERIC(18,4) NOT NULL,
    indicators_json    JSONB         NOT NULL,
    summary            TEXT          NOT NULL,
    sentiment          VARCHAR(10)   NOT NULL,
    key_points_json    JSONB         NOT NULL,
    model_used         VARCHAR(100)  NOT NULL,
    prompt_version     VARCHAR(50)   NOT NULL DEFAULT 'v1',
    prompt_template_id UUID          REFERENCES prompt_template(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticker_narrative_snapshot_symbol_generated
    ON ticker_narrative_snapshot(symbol, generated_at DESC);

CREATE INDEX idx_ticker_narrative_snapshot_prompt_template
    ON ticker_narrative_snapshot(prompt_template_id);


CREATE TABLE ticker_narrative_job (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol      VARCHAR(20) NOT NULL,
    status      VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    snapshot_id UUID        REFERENCES ticker_narrative_snapshot(id) ON DELETE SET NULL,
    error       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticker_narrative_job_symbol_status_created
    ON ticker_narrative_job(symbol, status, created_at DESC);

CREATE INDEX idx_ticker_narrative_job_snapshot
    ON ticker_narrative_job(snapshot_id);


CREATE TABLE prompt_score (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id        UUID         REFERENCES ticker_narrative_snapshot(id) ON DELETE SET NULL,
    prompt_template_id UUID         NOT NULL REFERENCES prompt_template(id) ON DELETE RESTRICT,
    latency_ms         INTEGER      NOT NULL,
    retry_count        INTEGER      NOT NULL DEFAULT 0,
    parse_failed       BOOLEAN      NOT NULL DEFAULT FALSE,
    validator_failed   BOOLEAN      NOT NULL DEFAULT FALSE,
    user_thumbs        SMALLINT     NOT NULL DEFAULT 0 CHECK (user_thumbs IN (-1, 0, 1)),
    llm_judge_score    NUMERIC(5,2),
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_prompt_score_prompt_template
    ON prompt_score(prompt_template_id, created_at DESC);

CREATE UNIQUE INDEX idx_prompt_score_snapshot_unique
    ON prompt_score(snapshot_id) WHERE snapshot_id IS NOT NULL;


CREATE TABLE screener_snapshot_day (
    date       DATE        NOT NULL,
    provider   VARCHAR(20) NOT NULL,
    movers     JSONB       NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT screener_snapshot_day_pkey PRIMARY KEY (date, provider)
);

CREATE INDEX idx_screener_snapshot_provider_date
    ON screener_snapshot_day(provider, date DESC);


INSERT INTO prompt_template (name, version, system_prompt, is_active, activated_at, notes)
VALUES (
    'narrative-default',
    'v3-body-only',
    $body$You are a financial writer. Given one ticker's current price and pre-computed indicators, produce a short factual technical summary — describe what the indicators show, no predictions, no buy/sell advice.$body$,
    TRUE,
    now(),
    'Reset to body-only on V2 (2026-05-22). The technical envelope (JSON contract, sentiment rule, length ceiling) is now appended in code by TickerNarrativeExecutor. Edit only the persona / tone here ; the contract cannot be overridden from the UI.'
);


INSERT INTO lexicon_entry (term, definition_fr, definition_en) VALUES
  ('Account Equity', 'Capital total du compte', 'Total account capital'),
  ('Account Total', 'Total du compte', 'Account total'),
  ('Add', 'Ajout d''actions dans une position préalablement prise', 'Adding shares to a position already opened'),
  ('Average', 'Moyenne', 'Average'),
  ('Average End of Day (EOD)', 'Moyenne des valeurs d''actions à la fin de la journée', 'Average of the share prices at the end of the day'),
  ('Average Low of Day (LOD)', 'Moyenne des valeurs d''actions la plus basse de la journée', 'Average of the lowest share prices of the day'),
  ('Average Push', 'Poussée moyenne', 'Average push'),
  ('Average TP (Take Profit)', 'Moyenne d''ordres placés pour fermer une position', 'Average of the orders placed to close a position'),
  ('Bearish', 'Momentum descendant', 'Downward momentum'),
  ('Borrow Fee', 'Frais pour emprunter les actions', 'Fee charged to borrow the shares'),
  ('Break Even', 'Retour au point "0" dans une perte', 'Return to break-even ("0") on a losing position'),
  ('Break Out', 'Le titre passe au travers d''une zone de résistance ou de support', 'The stock breaks through a resistance or support zone'),
  ('Broker', 'Entreprise qui vend et loue des actions', 'Company that sells and lends shares'),
  ('Buy', 'Achat d''actions pour un Long', 'Buying shares for a Long'),
  ('Calculator', 'Calculatrice', 'Calculator'),
  ('Candle Stick', 'Inscription visuelle de la valeur d''un titre inscrite sur une charte. Directement reliée au Time Frame choisi', 'Visual mark of a stock''s value plotted on a chart. Directly tied to the chosen Time Frame'),
  ('Close', 'Prix à la fermeture du marché', 'Price at market close'),
  ('Comments', 'Commentaires', 'Comments'),
  ('Cover', 'Rachat d''action pour un Short', 'Buying back shares to close a Short'),
  ('Credit', 'Retour des actions chez le broker', 'Returning the shares to the broker'),
  ('Current Risk', 'Risque actuel', 'Current risk'),
  ('Double Top (DT)', 'Le titre tente par deux reprises de briser une zone de résistance', 'The stock attempts twice to break a resistance zone'),
  ('End of Day (EOD)', 'Prix de l''action à la fin de la journée', 'The stock''s price at the end of the day'),
  ('Entry', 'Entrée', 'Entry'),
  ('Entry after 11AM?', 'Entrée après 11h?', 'Entry after 11 AM?'),
  ('Exit', 'Sortie d''une prise de position', 'Exiting a position'),
  ('EXT (Extention) from Open (%)', 'Pourcentage d''extension comparé au prix d''ouverture', 'Percentage extension relative to the open price'),
  ('EXT w/ Gap (Extension with Gap) (%)', 'Pourcentage d''extension incluant le gap up', 'Percentage extension including the gap up'),
  ('False Break Out', 'Le titre passe au travers d''une zone de résistance ou de support MAIS retourne au Momentum précédent en retraversant la zone de support ou de résistance', 'The stock breaks through a resistance or support zone BUT returns to the previous momentum by crossing back the support or resistance zone'),
  ('Fees', 'Frais', 'Fees'),
  ('Float', 'Nombre d''actions disponible pour le titre', 'Number of shares available for the stock'),
  ('Full', 'Complet', 'Full'),
  ('Gain/Loss', 'Gain/Perte', 'Gain/Loss'),
  ('Gap Up', 'Gain en valeur d''un stock comparé au prix de fermeture la veille', 'A stock''s rise in value compared to the previous day''s closing price'),
  ('Gapper', 'Gain en valeur d''un Stock sur un temps donné', 'A stock''s rise in value over a given time'),
  ('GUS', 'Gap Up Short', 'Gap Up Short'),
  ('Half', 'Moitié', 'Half'),
  ('High', 'Valeur de l''action la plus haute de la journée', 'The highest value of the stock for the day'),
  ('I''m Out', 'Retrait de position', 'Exiting the position'),
  ('Include < $1 Stock?', 'Inclure les compagnies avec des actions à moins de $1', 'Include companies with shares under $1?'),
  ('Include > 20% Institutions?', 'Inclure les compagnies avec plus de 20% d''institutions?', 'Include companies with more than 20% institutional ownership?'),
  ('Include Entries After 11AM?', 'Inclure les entrées après 11h?', 'Include entries after 11 AM?'),
  ('Include SSR?', 'Inclure les tickers qui étaient en SSR (Short Seller Restriction)?', 'Include tickers that were under SSR (Short Seller Restriction)?'),
  ('Indicators', 'Série d''aides à la prise de décision indiquant des calculs relatifs aux marchés', 'Set of decision-support tools showing market-related calculations'),
  ('Intraday', 'Période qui n''inclut que l''ouverture des marchés (exclut le PRE et POST Market)', 'Period covering only regular market hours (excludes the PRE and POST market)'),
  ('Investment', 'Investissement', 'Investment'),
  ('Key Level', 'Niveau ou zone où un changement de Momentum est très probable', 'Level or zone where a change of momentum is very likely'),
  ('Level II (Market Depth)', 'Indicateur en direct de l''offre et la demande d''un titre. Associé à un panneau de prise de position', 'Live indicator of a stock''s supply and demand. Tied to an order-entry panel'),
  ('Limit (LMT)', 'Prise de position avec choix de point d''entrée ou de sortie', 'Order with a chosen entry or exit price'),
  ('Limit (LMT) on close', 'Sortie LMT sur fermeture de journée', 'LMT exit at the market close'),
  ('Long', 'Entrée sur un marché ascendant (Bullish)', 'Entry on a rising (bullish) market'),
  ('Loss', 'Perte', 'Loss'),
  ('Low of Day (LOD)', 'Valeur de l''action la plus basse de la journée', 'The lowest value of the stock for the day'),
  ('Market (MKT)', 'Prise de position immédiate ($)', 'Immediate order at market price ($)'),
  ('Market (MKT) on close', 'Sortie MKT sur fermeture de journée ($)', 'MKT exit at the market close ($)'),
  ('Max Shares to Short', 'Nombre maximal de shares à shorter', 'Maximum number of shares to short'),
  ('Me vs 10/40', 'Moi versus 10/40', 'Me versus 10/40'),
  ('Me vs 7/31', 'Moi versus 7/31', 'Me versus 7/31'),
  ('Me vs Custom', 'Moi versus stratégie personnalisée', 'Me versus a custom strategy'),
  ('Moving Average (M.A.)', 'Indicateurs personnalisables de la moyenne du mouvement d''un titre', 'Customizable indicators of the average movement of a stock'),
  ('New High', 'Valeur de l''action la plus haute de la journée', 'The highest value of the stock for the day'),
  ('New Low', 'Valeur de l''action la plus basse de la journée', 'The lowest value of the stock for the day'),
  ('No Trade', 'Pas de trade', 'No trade'),
  ('Open', 'Ouverture', 'Open'),
  ('Open Price', 'Prix à l''ouverture', 'Price at the open'),
  ('P/L (Profit/Loss)', 'Gain/Perte', 'Gain/Loss'),
  ('Position size', 'Taille de position', 'Position size'),
  ('PostMarket', 'Période d''ouverture contenue après la fermeture des marchés à 16h30', 'Trading session held after the market close at 4:30 PM'),
  ('PreMarket', 'Période d''ouverture contenue avant l''ouverture des marchés à 9h30', 'Trading session held before the market open at 9:30 AM'),
  ('Price', 'Prix', 'Price'),
  ('Push', 'Poussée', 'Push'),
  ('Px (Price)', 'Prix', 'Price'),
  ('Ranging', 'Mouvement latéral d''un stock pris entre une résistance et un support', 'Sideways movement of a stock caught between a resistance and a support'),
  ('Rejection', 'Rejet', 'Rejection'),
  ('Remaining Shares to Short', 'Nombre d''actions qui restent à shorter', 'Number of shares left to short'),
  ('Residual', 'Résiduel/Restant', 'Residual/Remaining'),
  ('Resistance', 'Point de passage qui résiste à la montée de la valeur du stock', 'Price level that resists the stock''s rise'),
  ('Reversal', 'Passage d''ascendant à descendant ou vice versa', 'Switch from rising to falling or vice versa'),
  ('Risk', 'Risque', 'Risk'),
  ('Risk per Share', 'Risque par action', 'Risk per share'),
  ('Risk per trade ($)', 'Risque par trade', 'Risk per trade'),
  ('Scalp', 'Couper la perte d''un reverse ascendant sur un short', 'Cutting the loss of an upward reversal on a short'),
  ('Sell', 'Vente d''action pour un Long', 'Selling shares to close a Long'),
  ('Share Count', 'Nombre d''actions', 'Number of shares'),
  ('Shares', 'Actions', 'Shares'),
  ('Shares Covered', 'Nombre d''actions rachetées pour couvrir la position de short', 'Number of shares bought back to cover the short position'),
  ('Shares in Play', 'Nombre d''actions dans un trade', 'Number of shares in a trade'),
  ('Short', 'Entrée sur un marché descendant', 'Entry on a falling market'),
  ('Short Into Resistance (SIR)', 'Prendre un trade short basé sur une résistance', 'Taking a short trade based on a resistance'),
  ('Short Locate', 'Vérification de la disponibilité d''un stock pour location (louer) chez les brokers', 'Checking a stock''s availability to borrow from brokers'),
  ('Short Seller Restriction (SSR)', 'Titres sur lesquels une restriction est imposée pour les positions Shorts. Les prises de position d''entrée doivent se faire sur un Candlestick ascendant', 'Stocks under a restriction on short positions. Entry positions must be taken on an upward candlestick'),
  ('Simple Order Entry', 'Panneau de prise de position indépendant', 'Standalone order-entry panel'),
  ('Stock', 'Action', 'Stock'),
  ('Stop Loss/Stopped Out', 'Niveau de prix prédéterminé auquel une position est automatiquement exécutée afin de limiter les pertes', 'Predetermined price level at which a position is automatically executed to limit losses'),
  ('Stop-Limit (LMT)', 'Prise de position avec choix de sortie', 'Order with a chosen exit price'),
  ('Stop-Market (MKT)', 'Prise de position avec choix de sortie ($)', 'Order with a chosen exit at market price ($)'),
  ('Support', 'Point de passage qui résiste à la descente de la valeur du stock', 'Price level that resists the stock''s fall'),
  ('Take Profit (TP)', 'Ordre placé pour fermer une position', 'Order placed to close a position'),
  ('Ticker', 'Abréviation d''un titre', 'A stock''s abbreviation'),
  ('Ticker : Warrant', 'Actions latérales issues avant l''entrée en marché du titre officiel', 'Side shares issued before the official stock enters the market'),
  ('Time Frame', 'Fenêtre temporelle sur laquelle la charte est constituée', 'Time window over which the chart is built'),
  ('Time of DT (Double Top)', 'L''heure où le premier ''top'' ou high (valeur de l''action la plus haute de la journée) s''est présenté', 'The time the first ''top'' or high (the stock''s highest value of the day) occurred'),
  ('Time of First Top', 'L''heure du deuxième ''top''', 'The time of the second ''top'''),
  ('Top List', 'Liste des titres classifiés par leurs mouvements de valeur. En valeurs monétaires ou en pourcentage', 'List of stocks ranked by their value moves, in dollar terms or in percentage'),
  ('Total Capital', 'Capital total', 'Total capital'),
  ('Total Equity', 'Capital total', 'Total capital'),
  ('Total Investment', 'Investissement total', 'Total investment'),
  ('Trend Lines', 'Ligne imaginaire qui relie les points les plus élevés ou les plus bas d''une séquence', 'Imaginary line connecting the highest or lowest points of a sequence'),
  ('Volatile', 'Titre qui contient un risque de mouvement ascendant et considérable. Souvent associé à un Float de bas volume', 'A stock carrying a risk of a large upward move. Often associated with a low-volume float'),
  ('Volume', 'Nombre de transactions en cours, qu''elles soient une vente ou un achat de titre', 'Number of ongoing transactions, whether a sale or a purchase of the stock'),
  ('Wick', 'Inscription visuelle (ligne fine) en tête ou bas d''un Candle Stick. Indique la valeur d''une demande de bas volume', 'Visual mark (thin line) at the top or bottom of a candlestick. Indicates a low-volume demand level'),
  ('Win', 'Gain', 'Win'),
  ('Win Rate', 'Taux de réussite', 'Win rate'),
  ('Year-to-Date (YTD)', 'Cumul annuel', 'Year-to-date total'),
  ('% Capital at risk', 'Pourcentage de capital à risque', 'Percentage of capital at risk'),
  ('% From Initial Top', 'Pourcentage de différence basé sur le premier ''top'' ou high (valeur de l''action la plus haute de la journée)', 'Percentage difference based on the first ''top'' or high (the stock''s highest value of the day)'),
  ('% of Total Equity @ Risk', 'Pourcentage de capital à risque', 'Percentage of total equity at risk');
