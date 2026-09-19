-- Local demo data — mirrors the mockups (`mockup/`, September 2026) so every screen has something
-- realistic to show. **Local database only** : this is not a Flyway migration and never runs in prod.
--
-- Run it from the Tilt UI (`postgres` resource → "Seed") or by hand :
--   docker exec -i portfolioai-postgres psql -U portfolioai -d portfolioai -v ON_ERROR_STOP=1 < devops/local/seed-demo.sql
--
-- Everything belongs to the first user in `app_user` (log in once, or boot in no-auth mode, first).
-- The script aborts if that user already has data, so it never overwrites anything : use Tilt's
-- "Purge" first to start from an empty database.
--
-- Matches the schema up to V12. When a model changes (redesign issues #186, #187, #192…), update
-- this file in the same PR.

DO $$
DECLARE
  uid uuid := (SELECT id FROM app_user ORDER BY created_at LIMIT 1);
  s   record;
  t   record;
  sid uuid;
  tid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'no user in app_user — log in once first'; END IF;
  IF EXISTS (SELECT 1 FROM trade_entry WHERE user_id = uid)
     OR EXISTS (SELECT 1 FROM stat_entry WHERE created_by = uid)
     OR EXISTS (SELECT 1 FROM candidate WHERE user_id = uid)
     OR EXISTS (SELECT 1 FROM account_movement WHERE user_id = uid) THEN
    RAISE EXCEPTION 'the user already has data — seed skipped';
  END IF;

  -- ------------------------------------------------------------------ candidates
  -- Morning capture. total_capital / pct_capital_at_risk are still mandatory in the current schema.
  INSERT INTO candidate (user_id, trading_date, ticker, total_capital, pct_capital_at_risk, open_price,
                         previous_close, float_shares, volume, morning_push, borrow_cost_per_share, note)
  VALUES
    (uid, '2026-09-18', 'SGBX', 25000, 2, 1.85, 1.12,  3.9, 9.7, 2.46, 0.12, 'Locate cher, float serré — attention au squeeze'),
    (uid, '2026-09-18', 'BNRG', 25000, 2, 5.40, 3.30, 11.2, 2.1, 5.94, 0.08, 'Offering possible, surveiller les filings'),
    (uid, '2026-09-18', 'MLGO', 25000, 2, 3.10, 1.95,  6.4, 4.8, 3.72, 0.04, 'Résistance 3,75'),
    (uid, '2026-09-18', 'ATXG', 25000, 2, 0.92, 0.58, 25.0, 1.3, 1.08, 0.01, NULL),
    (uid, '2026-09-18', 'VERB', 25000, 2, 7.80, 5.10, 58.0, 0.9, 8.35, 0.05, 'Gros float, sans doute à écarter'),
    (uid, '2026-09-17', 'KTTA', 25000, 2, 4.05, 2.65,  8.2, 3.1, 4.65, 0.03, 'Résistance 4,65 — high PM, pas de news');

  -- ------------------------------------------------------------------ stats
  -- Session values; percentages computed vs the open (current model : push = HOD vs open).
  FOR s IN
    SELECT * FROM (VALUES
      ('2026-09-17'::date, 'KTTA', 52.8,  8.2, 4.20, 4.62, 3.41, 3.52, false, false, false, 'Push rejeté sous 4,65'),
      ('2026-09-16'::date, 'BNZI', 61.8,  4.5, 2.90, 3.05, 2.44, 2.58, false, true,  false, NULL),
      ('2026-09-15'::date, 'SNTG', 54.4, 12.0, 6.00, 7.14, 5.80, 6.95, false, false, false, 'Squeeze en fin de matinée'),
      ('2026-09-12'::date, 'NUWE', 56.4,  6.7, 3.20, 3.38, 2.52, 2.61, false, false, false, NULL),
      ('2026-09-11'::date, 'HOTH', 54.3, 18.3, 7.30, 7.82, 6.90, 7.05, false, false, true,  NULL),
      ('2026-09-11'::date, 'ZVSA', 54.5,  5.1, 3.55, 4.40, 3.30, 4.12, false, false, false, 'Pas tradé — push trop fort'),
      ('2026-09-10'::date, 'AEHL', 78.2,  3.4, 1.90, 2.48, 1.85, 2.31, false, false, false, NULL),
      ('2026-09-10'::date, 'MULN', 63.5, 22.0, 0.88, 0.95, 0.71, 0.74, true,  false, false, 'Sous 1 $ — pas tradé'),
      ('2026-09-09'::date, 'CRKN', 58.1,  9.9, 5.00, 5.21, 3.85, 3.95, false, false, false, NULL),
      ('2026-09-08'::date, 'TOP',  48.7, 32.0, 8.50, 8.95, 7.95, 8.10, false, false, false, NULL)
    ) AS v(d, ticker, gap, flt, o, h, l, e, u1, ssr, a11, note)
  LOOP
    INSERT INTO stat_entry (trade_date, ticker, gap_up_percent, float_shares_millions, under_1_dollar, ssr,
                            entry_after_11am, note, open_price, high_price, lod_price, eod_price,
                            push_percent, lod_percent, eod_percent, source, created_by)
    VALUES (s.d, s.ticker, s.gap, s.flt, s.u1, s.ssr, s.a11, s.note, s.o, s.h, s.l, s.e,
            round((s.h - s.o) / s.o * 100, 2), round((s.l - s.o) / s.o * 100, 2),
            round((s.e - s.o) / s.o * 100, 2), 'MANUAL', uid);
  END LOOP;

  -- Today's stat, still to complete after the 4 pm close.
  INSERT INTO stat_entry (trade_date, ticker, gap_up_percent, float_shares_millions, note, source, created_by)
  VALUES ('2026-09-18', 'SGBX', 65.2, 3.9, 'Locate cher, float serré — attention au squeeze', 'MANUAL', uid);

  -- ------------------------------------------------------------------ trades (+ executions, account movements)
  FOR t IN
    SELECT * FROM (VALUES
      ('2026-09-17'::date, 'KTTA', 350, 4.50, 3.66,  294.00, 18.6667, 'Push à 4,62 rejeté sous la résistance de 4,65 (high PM). Deuxième entrée sur le rejet, cover moitié à 3,78, le reste après le flush de midi.', 'Couvert la 2e moitié trop tôt : LOD à 3,41, objectif à 3,36 abandonné par peur du rebond.'),
      ('2026-09-16'::date, 'BNZI', 500, 2.84, 2.61,  115.00,  8.0986, 'Fade propre après l''open, SSR déclenché en fin de matinée.', NULL),
      ('2026-09-15'::date, 'SNTG', 200, 6.10, 6.72, -124.00,-10.1639, 'Squeeze au-dessus du high PM, stop touché.', 'Entrée trop tôt, pas attendu le rejet du push.'),
      ('2026-09-12'::date, 'NUWE', 400, 3.25, 2.70,  220.00, 16.9231, 'Rejet net sous 3,40, tenu jusqu''au flush.', NULL),
      ('2026-09-11'::date, 'HOTH', 250, 7.40, 7.28,   30.00,  1.6216, 'Peu de mouvement, sorti à l''EOD.', 'Entrée après 11h — setup déjà essoufflé.'),
      ('2026-09-10'::date, 'AEHL', 600, 1.92, 2.21, -174.00,-15.1042, 'Squeeze violent à l''open (+30 %).', 'Float trop petit (3,4 M) : squeeze prévisible.'),
      ('2026-09-09'::date, 'CRKN', 300, 5.05, 3.98,  321.00, 21.1881, 'Fade continu toute la matinée, LOD à −23 %.', NULL),
      ('2026-09-08'::date, 'TOP',  150, 8.60, 8.12,   72.00,  5.5814, 'Petit fade, gros float.', NULL)
    ) AS v(d, ticker, size, avg_in, avg_out, pnl, gain, note, err)
  LOOP
    SELECT id INTO sid FROM stat_entry WHERE created_by = uid AND trade_date = t.d AND ticker = t.ticker;
    INSERT INTO trade_entry (user_id, trade_date, ticker, direction, pattern, size, open_price, exit_price,
                             profit_dollars, gain_percent, note, error_note, stat_entry_id)
    VALUES (uid, t.d, t.ticker, 'SHORT', 'GUS', t.size, t.avg_in, t.avg_out, t.pnl, t.gain, t.note, t.err, sid)
    RETURNING id INTO tid;

    IF t.ticker = 'KTTA' THEN
      INSERT INTO trade_execution (trade_entry_id, seq, kind, shares, price) VALUES
        (tid, 0, 'ENTRY', 200, 4.41), (tid, 1, 'ENTRY', 150, 4.62),
        (tid, 2, 'EXIT',  150, 3.78), (tid, 3, 'EXIT',  200, 3.57);
    ELSE
      INSERT INTO trade_execution (trade_entry_id, seq, kind, shares, price) VALUES
        (tid, 0, 'ENTRY', t.size, t.avg_in), (tid, 1, 'EXIT', t.size, t.avg_out);
    END IF;

    INSERT INTO account_movement (user_id, type, amount, value_date, note, trade_entry_id)
    VALUES (uid, 'TRADE', t.pnl, t.d, t.ticker, tid);
  END LOOP;

  -- ------------------------------------------------------------------ cash movements
  -- Opening balance (end of August), a withdrawal, a deposit and a reconciliation correction.
  INSERT INTO account_movement (user_id, type, amount, value_date, note, target_balance) VALUES
    (uid, 'DEPOSIT',    26120.50, '2026-08-31', 'Solde de clôture août', NULL),
    (uid, 'WITHDRAWAL',  -500.00, '2026-09-02', 'Retrait vers compte courant', NULL),
    (uid, 'ADJUSTMENT',   -12.40, '2026-09-12', 'Réconciliation relevé — frais d''emprunt', 26077.10),
    (uid, 'DEPOSIT',     1000.00, '2026-09-15', 'Virement Wealthsimple', NULL);

  RAISE NOTICE 'seed OK for user %', uid;
END $$;

SELECT 'candidates' AS t, count(*) FROM candidate
UNION ALL SELECT 'stats', count(*) FROM stat_entry
UNION ALL SELECT 'trades', count(*) FROM trade_entry
UNION ALL SELECT 'executions', count(*) FROM trade_execution
UNION ALL SELECT 'movements', count(*) FROM account_movement
UNION ALL SELECT 'balance', sum(amount)::int FROM account_movement;
