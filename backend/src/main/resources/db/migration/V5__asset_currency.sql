-- V5: Ajout devise et valeur comptable CAD sur l'actif
ALTER TABLE asset
    ADD COLUMN IF NOT EXISTS currency       VARCHAR(10)   NOT NULL DEFAULT 'CAD',
    ADD COLUMN IF NOT EXISTS book_value_cad NUMERIC(18,2) NOT NULL DEFAULT 0;
