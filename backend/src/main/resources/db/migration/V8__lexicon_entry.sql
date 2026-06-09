-- V8__lexicon_entry.sql — Trading lexicon (glossary) table + bilingual seed.
--
-- A small, global, shared reference dataset : one row per trading term (English label) with its
-- definition in **both** languages (`definition_fr` / `definition_en`, both NOT NULL — there is no
-- missing-translation state). Surfaced on the `/lexicon` page (read-only, shows the definition of
-- the active language) and managed from `/settings/lexicon` (ADMIN CRUD, edits both). Unlike
-- `trade_entry` it is NOT multi-tenant (no `user_id`) — a single shared glossary.
--
-- Seeded (117 terms) from the hand-authored bilingual `docs/TTD/lexique/lexique.csv` (the
-- authoring source ; the app reads the table, never the file). `term` is unique case-insensitively
-- (unique index on `lower(term)` + an app-layer pre-check).

CREATE TABLE lexicon_entry (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    term           VARCHAR(120) NOT NULL,
    definition_fr  TEXT         NOT NULL,
    definition_en  TEXT         NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness on the term — "Push" and "push" are the same glossary entry.
CREATE UNIQUE INDEX ux_lexicon_entry_term ON lexicon_entry (lower(term));

-- Bump `updated_at` on every UPDATE — same pattern as trade_entry / stat_entry.
CREATE OR REPLACE FUNCTION lexicon_entry_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lexicon_entry_set_updated_at
BEFORE UPDATE ON lexicon_entry
FOR EACH ROW EXECUTE FUNCTION lexicon_entry_touch_updated_at();

-- Initial glossary, alphabetical (symbols last). Both definitions seeded.
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
