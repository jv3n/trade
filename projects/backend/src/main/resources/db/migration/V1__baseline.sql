-- Baseline of the whole schema, squashed from the twenty migrations that built it (#217).
--
-- The production database is reset before this lands, and every other environment starts empty
-- (Testcontainers in CI, the local stack under Tilt), so no `flyway_schema_history` anywhere
-- carries the old chain — squashing is only safe on that condition, and this is the one moment it
-- holds.
--
-- What the old chain spent itself on, and what disappears with it : four enum types created then
-- dropped (`trade_exit_strategy`, `trade_open_side`, `trade_pattern`, `trade_play`), six pre-pivot
-- tables built then removed (prompts, narratives, screener, watchlist), and `stat_entry` /
-- `candidate` dropped and recreated mid-way. 940 lines to reach what is below.
--
-- Generated from `pg_dump --schema-only` of the replayed chain and verified against it, so this is
-- the schema the application already runs on — not a hand-written approximation of it.

--
-- PostgreSQL database dump
--

--
-- Name: account_movement_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.account_movement_type AS ENUM (
    'DEPOSIT',
    'WITHDRAWAL',
    'TRADE',
    'ADJUSTMENT'
);

--
-- Name: execution_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.execution_kind AS ENUM (
    'ENTRY',
    'EXIT'
);

--
-- Name: pattern; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pattern AS ENUM (
    'GUS',
    'DT',
    'DISCRETIONARY'
);

--
-- Name: trade_direction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.trade_direction AS ENUM (
    'BUY',
    'SHORT'
);

--
-- Name: lexicon_entry_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lexicon_entry_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

--
-- Name: stat_entry_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stat_entry_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

--
-- Name: trade_entry_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trade_entry_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

--
-- Name: account_movement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_movement (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type public.account_movement_type NOT NULL,
    amount numeric(18,2) NOT NULL,
    value_date date NOT NULL,
    note character varying(2000),
    trade_entry_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    target_balance numeric(18,2),
    trade_direction public.trade_direction,
    trade_size integer,
    CONSTRAINT account_movement_amount_check CHECK ((amount <> (0)::numeric)),
    CONSTRAINT account_movement_target_type_check CHECK (((target_balance IS NULL) OR (type = 'ADJUSTMENT'::public.account_movement_type))),
    CONSTRAINT account_movement_trade_label_requires_trade CHECK ((((trade_direction IS NULL) AND (trade_size IS NULL)) OR (type = 'TRADE'::public.account_movement_type))),
    CONSTRAINT account_movement_trade_link_check CHECK (((type = 'TRADE'::public.account_movement_type) = (trade_entry_id IS NOT NULL)))
);

--
-- Name: account_reconciliation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_reconciliation (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    value_date date NOT NULL,
    broker_balance numeric(18,2) NOT NULL,
    app_balance numeric(18,2) NOT NULL,
    gap numeric(18,2) NOT NULL,
    correction_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: app_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_config (
    config_key character varying(100) NOT NULL,
    config_value text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: app_user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_user (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    display_name character varying(255),
    provider character varying(50) NOT NULL,
    provider_id character varying(255),
    role character varying(20) NOT NULL,
    last_login_at timestamp with time zone,
    theme character varying(20) DEFAULT 'system'::character varying NOT NULL,
    language character varying(5) DEFAULT 'fr'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    balance_currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    CONSTRAINT app_user_balance_currency_check CHECK (((balance_currency)::text = ANY ((ARRAY['USD'::character varying, 'CAD'::character varying])::text[]))),
    CONSTRAINT app_user_language_check CHECK (((language)::text = ANY ((ARRAY['fr'::character varying, 'en'::character varying])::text[]))),
    CONSTRAINT app_user_role_check CHECK (((role)::text = ANY ((ARRAY['ADMIN'::character varying, 'USER'::character varying])::text[]))),
    CONSTRAINT app_user_theme_check CHECK (((theme)::text = ANY ((ARRAY['system'::character varying, 'dark'::character varying, 'light'::character varying])::text[])))
);

--
-- Name: candidate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.candidate (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    trading_date date NOT NULL,
    pattern public.pattern DEFAULT 'GUS'::public.pattern NOT NULL,
    ticker character varying(20) NOT NULL,
    previous_close numeric(18,4) NOT NULL,
    pm_open numeric(18,4) NOT NULL,
    pm_high numeric(18,4) NOT NULL,
    float_millions numeric(12,2),
    volume_millions numeric(12,2),
    locate_per_share numeric(10,4),
    note character varying(2000),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT candidate_float_millions_check CHECK ((float_millions >= (0)::numeric)),
    CONSTRAINT candidate_locate_per_share_check CHECK ((locate_per_share >= (0)::numeric)),
    CONSTRAINT candidate_pm_high_check CHECK ((pm_high > (0)::numeric)),
    CONSTRAINT candidate_pm_open_check CHECK ((pm_open > (0)::numeric)),
    CONSTRAINT candidate_previous_close_check CHECK ((previous_close > (0)::numeric)),
    CONSTRAINT candidate_volume_millions_check CHECK ((volume_millions >= (0)::numeric)),
    CONSTRAINT ck_candidate_pm_high CHECK ((pm_high >= pm_open))
);

--
-- Name: lexicon_entry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lexicon_entry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    term character varying(120) NOT NULL,
    definition_fr text NOT NULL,
    definition_en text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: stat_entry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stat_entry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    candidate_id uuid,
    trade_date date NOT NULL,
    pattern public.pattern DEFAULT 'GUS'::public.pattern NOT NULL,
    ticker character varying(20) NOT NULL,
    previous_close numeric(18,4) NOT NULL,
    pm_open numeric(18,4) NOT NULL,
    pm_high numeric(18,4) NOT NULL,
    float_millions numeric(12,2),
    volume_millions numeric(12,2),
    locate_per_share numeric(10,4),
    note character varying(2000),
    open_price numeric(18,4),
    push_open_price numeric(18,4),
    hod_price numeric(18,4),
    lod_price numeric(18,4),
    eod_price numeric(18,4),
    ssr boolean DEFAULT false NOT NULL,
    under_1_dollar boolean DEFAULT false NOT NULL,
    entry_after_11am boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stat_entry_eod_price_check CHECK ((eod_price > (0)::numeric)),
    CONSTRAINT stat_entry_float_millions_check CHECK ((float_millions >= (0)::numeric)),
    CONSTRAINT stat_entry_hod_price_check CHECK ((hod_price > (0)::numeric)),
    CONSTRAINT stat_entry_locate_per_share_check CHECK ((locate_per_share >= (0)::numeric)),
    CONSTRAINT stat_entry_lod_price_check CHECK ((lod_price > (0)::numeric)),
    CONSTRAINT stat_entry_open_price_check CHECK ((open_price > (0)::numeric)),
    CONSTRAINT stat_entry_pm_high_check CHECK ((pm_high > (0)::numeric)),
    CONSTRAINT stat_entry_pm_open_check CHECK ((pm_open > (0)::numeric)),
    CONSTRAINT stat_entry_previous_close_check CHECK ((previous_close > (0)::numeric)),
    CONSTRAINT stat_entry_push_open_price_check CHECK ((push_open_price > (0)::numeric)),
    CONSTRAINT stat_entry_volume_millions_check CHECK ((volume_millions >= (0)::numeric))
);

--
-- Name: trade_attachment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trade_attachment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trade_entry_id uuid NOT NULL,
    content bytea NOT NULL,
    content_type character varying(100) NOT NULL,
    filename character varying(255),
    size_bytes integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trade_attachment_size_bytes_check CHECK ((size_bytes > 0))
);

--
-- Name: trade_entry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trade_entry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    trade_date date NOT NULL,
    ticker character varying(20) NOT NULL,
    pattern public.pattern DEFAULT 'GUS'::public.pattern NOT NULL,
    size integer,
    open_price numeric(18,4),
    exit_price numeric(18,4),
    profit_dollars numeric(18,2),
    gain_percent numeric(8,4),
    note character varying(2000),
    error_note character varying(2000),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    stat_entry_id uuid NOT NULL,
    direction public.trade_direction,
    has_screenshot boolean DEFAULT false NOT NULL,
    real_profit_dollars numeric(18,2),
    retained_profit_dollars numeric(18,2) GENERATED ALWAYS AS (COALESCE(real_profit_dollars, profit_dollars)) STORED,
    CONSTRAINT trade_entry_exit_price_check CHECK (((exit_price IS NULL) OR (exit_price > (0)::numeric))),
    CONSTRAINT trade_entry_open_price_check CHECK ((open_price > (0)::numeric)),
    CONSTRAINT trade_entry_size_check CHECK ((size > 0))
);

--
-- Name: trade_execution; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trade_execution (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trade_entry_id uuid NOT NULL,
    seq integer NOT NULL,
    kind public.execution_kind NOT NULL,
    shares integer NOT NULL,
    price numeric(18,4) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    executed_at time without time zone,
    CONSTRAINT trade_execution_price_check CHECK ((price > (0)::numeric)),
    CONSTRAINT trade_execution_shares_check CHECK ((shares > 0))
);

--
-- Name: account_movement account_movement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_movement
    ADD CONSTRAINT account_movement_pkey PRIMARY KEY (id);

--
-- Name: account_reconciliation account_reconciliation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_reconciliation
    ADD CONSTRAINT account_reconciliation_pkey PRIMARY KEY (id);

--
-- Name: app_config app_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_config
    ADD CONSTRAINT app_config_pkey PRIMARY KEY (config_key);

--
-- Name: app_user app_user_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_email_key UNIQUE (email);

--
-- Name: app_user app_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_pkey PRIMARY KEY (id);

--
-- Name: candidate candidate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidate
    ADD CONSTRAINT candidate_pkey PRIMARY KEY (id);

--
-- Name: lexicon_entry lexicon_entry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lexicon_entry
    ADD CONSTRAINT lexicon_entry_pkey PRIMARY KEY (id);

--
-- Name: stat_entry stat_entry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stat_entry
    ADD CONSTRAINT stat_entry_pkey PRIMARY KEY (id);

--
-- Name: trade_attachment trade_attachment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_attachment
    ADD CONSTRAINT trade_attachment_pkey PRIMARY KEY (id);

--
-- Name: trade_attachment trade_attachment_trade_entry_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_attachment
    ADD CONSTRAINT trade_attachment_trade_entry_id_key UNIQUE (trade_entry_id);

--
-- Name: trade_entry trade_entry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_entry
    ADD CONSTRAINT trade_entry_pkey PRIMARY KEY (id);

--
-- Name: trade_execution trade_execution_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_execution
    ADD CONSTRAINT trade_execution_pkey PRIMARY KEY (id);

--
-- Name: trade_execution trade_execution_trade_entry_id_seq_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_execution
    ADD CONSTRAINT trade_execution_trade_entry_id_seq_key UNIQUE (trade_entry_id, seq);

--
-- Name: account_reconciliation uq_account_reconciliation_day; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_reconciliation
    ADD CONSTRAINT uq_account_reconciliation_day UNIQUE (user_id, value_date);

--
-- Name: candidate ux_candidate_user_day_ticker; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidate
    ADD CONSTRAINT ux_candidate_user_day_ticker UNIQUE (user_id, trading_date, ticker);

--
-- Name: stat_entry ux_stat_entry_user_day_ticker; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stat_entry
    ADD CONSTRAINT ux_stat_entry_user_day_ticker UNIQUE (user_id, trade_date, ticker);

--
-- Name: idx_account_movement_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_account_movement_user_date ON public.account_movement USING btree (user_id, value_date DESC);

--
-- Name: idx_account_reconciliation_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_account_reconciliation_user_date ON public.account_reconciliation USING btree (user_id, value_date DESC);

--
-- Name: idx_stat_entry_candidate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stat_entry_candidate ON public.stat_entry USING btree (candidate_id);

--
-- Name: idx_stat_entry_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stat_entry_user_date ON public.stat_entry USING btree (user_id, trade_date DESC);

--
-- Name: idx_trade_entry_retained_profit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trade_entry_retained_profit ON public.trade_entry USING btree (user_id, retained_profit_dollars);

--
-- Name: idx_trade_entry_ticker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trade_entry_ticker ON public.trade_entry USING btree (ticker);

--
-- Name: idx_trade_entry_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trade_entry_user_date ON public.trade_entry USING btree (user_id, trade_date DESC);

--
-- Name: idx_trade_entry_user_date_ticker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trade_entry_user_date_ticker ON public.trade_entry USING btree (user_id, trade_date, ticker);

--
-- Name: idx_trade_execution_entry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trade_execution_entry ON public.trade_execution USING btree (trade_entry_id);

--
-- Name: ux_account_movement_trade; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_account_movement_trade ON public.account_movement USING btree (trade_entry_id) WHERE (trade_entry_id IS NOT NULL);

--
-- Name: ux_lexicon_entry_term; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_lexicon_entry_term ON public.lexicon_entry USING btree (lower((term)::text));

--
-- Name: ux_trade_entry_stat_entry_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_trade_entry_stat_entry_id ON public.trade_entry USING btree (stat_entry_id);

--
-- Name: lexicon_entry lexicon_entry_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lexicon_entry_set_updated_at BEFORE UPDATE ON public.lexicon_entry FOR EACH ROW EXECUTE FUNCTION public.lexicon_entry_touch_updated_at();

--
-- Name: trade_entry trade_entry_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trade_entry_set_updated_at BEFORE UPDATE ON public.trade_entry FOR EACH ROW EXECUTE FUNCTION public.trade_entry_touch_updated_at();

--
-- Name: account_movement account_movement_trade_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_movement
    ADD CONSTRAINT account_movement_trade_entry_id_fkey FOREIGN KEY (trade_entry_id) REFERENCES public.trade_entry(id) ON DELETE CASCADE;

--
-- Name: account_movement account_movement_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_movement
    ADD CONSTRAINT account_movement_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;

--
-- Name: account_reconciliation account_reconciliation_correction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_reconciliation
    ADD CONSTRAINT account_reconciliation_correction_id_fkey FOREIGN KEY (correction_id) REFERENCES public.account_movement(id) ON DELETE SET NULL;

--
-- Name: account_reconciliation account_reconciliation_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_reconciliation
    ADD CONSTRAINT account_reconciliation_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;

--
-- Name: candidate candidate_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidate
    ADD CONSTRAINT candidate_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;

--
-- Name: trade_entry fk_trade_entry_stat_entry; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_entry
    ADD CONSTRAINT fk_trade_entry_stat_entry FOREIGN KEY (stat_entry_id) REFERENCES public.stat_entry(id) ON DELETE RESTRICT;

--
-- Name: stat_entry stat_entry_candidate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stat_entry
    ADD CONSTRAINT stat_entry_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.candidate(id) ON DELETE SET NULL;

--
-- Name: stat_entry stat_entry_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stat_entry
    ADD CONSTRAINT stat_entry_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;

--
-- Name: trade_attachment trade_attachment_trade_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_attachment
    ADD CONSTRAINT trade_attachment_trade_entry_id_fkey FOREIGN KEY (trade_entry_id) REFERENCES public.trade_entry(id) ON DELETE CASCADE;

--
-- Name: trade_entry trade_entry_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_entry
    ADD CONSTRAINT trade_entry_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;

--
-- Name: trade_execution trade_execution_trade_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_execution
    ADD CONSTRAINT trade_execution_trade_entry_id_fkey FOREIGN KEY (trade_entry_id) REFERENCES public.trade_entry(id) ON DELETE CASCADE;

--
-- PostgreSQL database dump complete
--

--
-- Seed data
--
-- The bilingual glossary is reference content, not demo data : the lexicon page reads it and
-- `LexiconIntegrationTest` asserts it is there. It shipped in the original `V1__init` and has to
-- survive the squash. Ids and timestamps are left to the column defaults rather than frozen from
-- the machine that generated this file.
--

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
