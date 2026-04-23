-- V2 : Table d'ingestion des articles RSS

CREATE TABLE feed_source (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name     VARCHAR(255) NOT NULL,
    url      TEXT         NOT NULL UNIQUE,
    category VARCHAR(50)  NOT NULL, -- RSS, MARKET, MACRO, CRYPTO
    enabled  BOOLEAN      NOT NULL DEFAULT true
);

CREATE TABLE feed_article (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id   UUID        NOT NULL REFERENCES feed_source(id) ON DELETE CASCADE,
    guid        TEXT        NOT NULL,
    title       TEXT        NOT NULL,
    description TEXT,
    link        TEXT,
    published_at TIMESTAMPTZ,
    fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_id, guid)
);

CREATE INDEX idx_feed_article_source ON feed_article(source_id);
CREATE INDEX idx_feed_article_published_at ON feed_article(published_at DESC);
CREATE INDEX idx_feed_article_fetched_at ON feed_article(fetched_at DESC);

-- Sources RSS activées par défaut (MVP)
INSERT INTO feed_source (name, url, category) VALUES
    ('Reuters Business', 'https://feeds.reuters.com/reuters/businessNews', 'RSS'),
    ('Reuters Markets',  'https://feeds.reuters.com/reuters/marketsNews',  'RSS'),
    ('BFM Bourse',       'https://bfmbusiness.bfmtv.com/rss/info/flux-rss/flux-toutes-les-actualites/', 'RSS');
