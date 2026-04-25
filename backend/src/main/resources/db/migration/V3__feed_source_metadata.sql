-- V3 : Enrichissement feed_source avec métadonnées complètes

ALTER TABLE feed_source
    ADD COLUMN slug            VARCHAR(100) NOT NULL DEFAULT '',
    ADD COLUMN description     TEXT         NOT NULL DEFAULT '',
    ADD COLUMN free            BOOLEAN      NOT NULL DEFAULT true,
    ADD COLUMN requires_api_key BOOLEAN     NOT NULL DEFAULT false;

-- Mise à jour des 3 sources existantes avant d'ajouter la contrainte UNIQUE
UPDATE feed_source SET slug = 'reuters-business', description = 'Actualité économique mondiale'   WHERE url = 'https://feeds.reuters.com/reuters/businessNews';
UPDATE feed_source SET slug = 'reuters-markets',  description = 'Marchés financiers'              WHERE url = 'https://feeds.reuters.com/reuters/marketsNews';
UPDATE feed_source SET slug = 'bfm-bourse',       description = 'Actualité bourse française'      WHERE url = 'https://bfmbusiness.bfmtv.com/rss/info/flux-rss/flux-toutes-les-actualites/';

ALTER TABLE feed_source ADD CONSTRAINT feed_source_slug_unique UNIQUE (slug);

-- Insertion des 19 sources supplémentaires
INSERT INTO feed_source (slug, name, url, category, enabled, description, free, requires_api_key) VALUES
    ('lemonde-eco',    'Le Monde Économie',     'https://www.lemonde.fr/economie/rss_full.xml',                                         'RSS',    false, 'Couverture macro française',                        true,  false),
    ('cnbc-markets',   'CNBC Markets',          'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258',   'RSS',    false, 'Actualité marchés US',                              true,  false),
    ('marketwatch',    'MarketWatch',           'https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines',                    'RSS',    false, 'Headlines temps réel US',                           true,  false),
    ('les-echos',      'Les Echos',             'https://www.lesechos.fr/rss/rss_finance.xml',                                          'RSS',    false, 'Finance et économie française',                     false, false),
    ('seeking-alpha',  'Seeking Alpha',         'https://seekingalpha.com/feed.xml',                                                    'RSS',    false, 'Analyses approfondies d''actions',                  false, false),
    ('yahoo-finance',  'Yahoo Finance',         'https://finance.yahoo.com',                                                            'MARKET', true,  'Cours, historique, fondamentaux — aucune clé requise', true, false),
    ('stooq',          'Stooq',                 'https://stooq.com',                                                                    'MARKET', true,  'Cours historiques EOD, couverture mondiale',         true,  false),
    ('alpha-vantage',  'Alpha Vantage',         'https://www.alphavantage.co',                                                          'MARKET', false, 'Cours + indicateurs techniques',                    true,  true),
    ('finnhub',        'Finnhub',               'https://finnhub.io',                                                                   'MARKET', false, 'Cours temps réel, news, fondamentaux',              true,  true),
    ('polygon',        'Polygon.io',            'https://polygon.io',                                                                   'MARKET', false, 'Cours, options, crypto — très complet',             true,  true),
    ('twelve-data',    'Twelve Data',           'https://twelvedata.com',                                                               'MARKET', false, 'Cours, ETF, indicateurs techniques',                true,  true),
    ('fred',           'FRED (Federal Reserve)','https://fred.stlouisfed.org',                                                          'MACRO',  true,  'Indicateurs US : PIB, inflation, taux directeurs…', true,  true),
    ('bce',            'BCE',                   'https://data.ecb.europa.eu',                                                           'MACRO',  true,  'Indicateurs zone euro',                             true,  false),
    ('world-bank',     'Banque Mondiale',       'https://data.worldbank.org',                                                           'MACRO',  false, 'Indicateurs économiques mondiaux',                  true,  false),
    ('insee',          'INSEE',                 'https://api.insee.fr',                                                                 'MACRO',  false, 'Statistiques économiques françaises',               true,  true),
    ('coingecko',      'CoinGecko',             'https://www.coingecko.com/api',                                                        'CRYPTO', true,  'Cours, market cap, volumes crypto',                 true,  false),
    ('binance',        'Binance Public API',    'https://binance-docs.github.io/apidocs/',                                              'CRYPTO', false, 'Cours temps réel crypto',                           true,  false),
    ('coinmarketcap',  'CoinMarketCap',         'https://coinmarketcap.com/api/',                                                       'CRYPTO', false, 'Cours et market cap crypto',                        true,  true);
