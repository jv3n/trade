-- ============================================================
-- Seed — Portefeuille de démonstration (~100 000 $)
-- Usage : déclencher via Tilt → db:seed
-- ============================================================

-- Portefeuille principal
INSERT INTO portfolio (id, name, description, created_at, updated_at)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Demo Portfolio',
    'Portefeuille de démonstration diversifié (~100 000 $)',
    now(),
    now()
);

-- ── ETFs ──────────────────────────────────────────────────────
INSERT INTO asset (portfolio_id, ticker, name, quantity, avg_buy_price, asset_type)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'VOO',  'Vanguard S&P 500 ETF',       50,   450.00, 'ETF'),
    ('00000000-0000-0000-0000-000000000001', 'QQQ',  'Invesco NASDAQ 100 ETF',      20,   420.00, 'ETF'),
    ('00000000-0000-0000-0000-000000000001', 'BND',  'Vanguard Total Bond ETF',     80,    74.00, 'BOND');

-- ── Actions US ────────────────────────────────────────────────
INSERT INTO asset (portfolio_id, ticker, name, quantity, avg_buy_price, asset_type)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'AAPL',  'Apple Inc.',                 80,   175.00, 'STOCK'),
    ('00000000-0000-0000-0000-000000000001', 'MSFT',  'Microsoft Corporation',      30,   380.00, 'STOCK'),
    ('00000000-0000-0000-0000-000000000001', 'NVDA',  'NVIDIA Corporation',         20,   450.00, 'STOCK'),
    ('00000000-0000-0000-0000-000000000001', 'GOOGL', 'Alphabet Inc.',              50,   165.00, 'STOCK'),
    ('00000000-0000-0000-0000-000000000001', 'AMZN',  'Amazon.com Inc.',            30,   180.00, 'STOCK');

-- ── Crypto ────────────────────────────────────────────────────
INSERT INTO asset (portfolio_id, ticker, name, quantity, avg_buy_price, asset_type)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'BTC', 'Bitcoin',   0.150000, 65000.00, 'CRYPTO'),
    ('00000000-0000-0000-0000-000000000001', 'ETH', 'Ethereum',  2.000000,  3200.00, 'CRYPTO');

-- ── Récap valeurs ─────────────────────────────────────────────
-- VOO   50 × 450   = 22 500 $
-- QQQ   20 × 420   =  8 400 $
-- BND   80 ×  74   =  5 920 $
-- AAPL  80 × 175   = 14 000 $
-- MSFT  30 × 380   = 11 400 $
-- NVDA  20 × 450   =  9 000 $
-- GOOGL 50 × 165   =  8 250 $
-- AMZN  30 × 180   =  5 400 $
-- BTC  0.15× 65000 =  9 750 $
-- ETH   2  × 3200  =  6 400 $
-- ─────────────────────────────────
-- TOTAL             = 101 020 $
