-- V6: Valeur marchande et rendement non réalisé sur l'actif
ALTER TABLE asset
    ADD COLUMN IF NOT EXISTS market_value    NUMERIC(18,4) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS unrealized_gain NUMERIC(18,4),
    ADD COLUMN IF NOT EXISTS gain_currency   VARCHAR(10);
