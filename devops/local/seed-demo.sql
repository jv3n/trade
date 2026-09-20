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
-- Matches the schema up to V15. When a model changes (redesign issues #186, #187, #192…), update
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
     OR EXISTS (SELECT 1 FROM stat_entry WHERE user_id = uid)
     OR EXISTS (SELECT 1 FROM candidate WHERE user_id = uid)
     OR EXISTS (SELECT 1 FROM account_movement WHERE user_id = uid) THEN
    RAISE EXCEPTION 'the user already has data — seed skipped';
  END IF;

  -- ------------------------------------------------------------------ candidates
  -- Morning capture (V13 model) : previous close, PM open (4:00 am), PM high, float and volume in M,
  -- locate in $ / share.
  INSERT INTO candidate (user_id, trading_date, pattern, ticker, previous_close, pm_open, pm_high,
                         float_millions, volume_millions, locate_per_share, note)
  VALUES
    (uid, '2026-09-18', 'GUS', 'SGBX', 1.12, 1.85, 2.46,  3.9, 9.7, 0.12, 'Locate cher, float serré — attention au squeeze'),
    (uid, '2026-09-18', 'GUS', 'BNRG', 3.30, 5.40, 5.94, 11.2, 2.1, 0.08, 'Offering possible, surveiller les filings'),
    (uid, '2026-09-18', 'GUS', 'MLGO', 1.95, 3.10, 3.72,  6.4, 4.8, 0.04, 'Résistance 3,75'),
    (uid, '2026-09-18', 'GUS', 'ATXG', 0.58, 0.92, 1.08, 25.0, 1.3, 0.01, NULL),
    (uid, '2026-09-18', 'GUS', 'VERB', 5.10, 7.80, 8.35, 58.0, 0.9, 0.05, 'Gros float, sans doute à écarter'),
    (uid, '2026-09-17', 'GUS', 'KTTA', 2.65, 4.05, 4.65,  8.2, 3.1, 0.03, 'Résistance 4,65 — high PM, pas de news');

  -- ------------------------------------------------------------------ stats
  -- V14 model : the premarket block is a copy of the candidate (previous close, PM open, PM high,
  -- float / volume in M, locate in $ / share) and the session block (open, push at open, HOD, LOD,
  -- EOD) is entered after the 4 pm close. No percentage is stored — gap, PM push and the session
  -- percentages are all derived from these prices. `candidate_id` is filled when a candidate exists
  -- for the same (day, ticker) : only SGBX 18/09 and KTTA 17/09 here, the older days predate the
  -- candidates captured above.
  FOR s IN
    SELECT * FROM (VALUES
      ('2026-09-17'::date, 'KTTA', 2.65, 4.05, 4.65,  8.2,  3.1, 0.03, 4.20, 4.62, 4.62, 3.41, 3.52, false, false, false, 'Push rejeté sous 4,65'),
      ('2026-09-16'::date, 'BNZI', 1.85, 2.99, 3.37,  4.5,  6.2, 0.06, 2.90, 3.05, 3.05, 2.44, 2.58, true,  false, false, NULL),
      ('2026-09-15'::date, 'SNTG', 3.95, 6.10, 6.60, 12.0,  2.4, 0.05, 6.00, 6.55, 7.14, 5.80, 6.95, false, false, false, 'Squeeze en fin de matinée'),
      ('2026-09-12'::date, 'NUWE', 2.10, 3.28, 3.66,  6.7,  3.8, 0.04, 3.20, 3.38, 3.38, 2.52, 2.61, false, false, false, NULL),
      ('2026-09-11'::date, 'HOTH', 4.80, 7.41, 8.08, 18.3,  1.9, 0.07, 7.30, 7.60, 7.82, 6.90, 7.05, false, false, true,  NULL),
      ('2026-09-11'::date, 'ZVSA', 2.35, 3.63, 4.22,  5.1,  7.0, 0.10, 3.55, 4.10, 4.40, 3.30, 4.12, false, false, false, 'Pas tradé — push trop fort'),
      ('2026-09-10'::date, 'AEHL', 1.05, 1.87, 2.13,  3.4, 11.5, 0.09, 1.90, 2.48, 2.48, 1.85, 2.31, false, false, false, NULL),
      ('2026-09-10'::date, 'MULN', 0.55, 0.90, 1.03, 22.0, 15.3, 0.01, 0.88, 0.95, 0.95, 0.71, 0.74, false, true,  false, 'Sous 1 $ — pas tradé'),
      ('2026-09-09'::date, 'CRKN', 3.20, 5.06, 5.48,  9.9,  4.4, 0.03, 5.00, 5.21, 5.21, 3.85, 3.95, false, false, false, NULL),
      ('2026-09-08'::date, 'TOP',  5.70, 8.48, 9.18, 32.0,  1.2, 0.02, 8.50, 8.80, 8.95, 7.95, 8.10, false, false, false, NULL)
    ) AS v(d, ticker, prev, pmo, pmh, flt, vol, loc, o, po, h, l, e, ssr, u1, a11, note)
  LOOP
    INSERT INTO stat_entry (user_id, candidate_id, trade_date, pattern, ticker,
                            previous_close, pm_open, pm_high, float_millions, volume_millions,
                            locate_per_share, note,
                            open_price, push_open_price, hod_price, lod_price, eod_price,
                            ssr, under_1_dollar, entry_after_11am)
    VALUES (uid,
            (SELECT id FROM candidate WHERE user_id = uid AND trading_date = s.d AND ticker = s.ticker),
            s.d, 'GUS', s.ticker, s.prev, s.pmo, s.pmh, s.flt, s.vol, s.loc, s.note,
            s.o, s.po, s.h, s.l, s.e, s.ssr, s.u1, s.a11);
  END LOOP;

  -- Today's stat, still to complete after the 4 pm close : the premarket block is in, the five
  -- session prices stay null.
  INSERT INTO stat_entry (user_id, candidate_id, trade_date, pattern, ticker,
                          previous_close, pm_open, pm_high, float_millions, volume_millions,
                          locate_per_share, note)
  VALUES (uid,
          (SELECT id FROM candidate WHERE user_id = uid AND trading_date = '2026-09-18' AND ticker = 'SGBX'),
          '2026-09-18', 'GUS', 'SGBX', 1.12, 1.85, 2.46, 3.9, 9.7, 0.12,
          'Locate cher, float serré — attention au squeeze');

  -- ------------------------------------------------------------------ trades (+ executions, account movements)
  -- V15 model (#192) : every trade hangs off its stat (mandatory FK), carries the fill times on its
  -- executions, and may carry a `real_profit_dollars` — the figure read off the TradeZero statement,
  -- a few cents / dollars below the computed one (fees, rounding). The retained P&L, the one the
  -- account movement is built from, is COALESCE(real, computed) : `pnl_real` is used below when it
  -- is set.
  FOR t IN
    SELECT * FROM (VALUES
      ('2026-09-17'::date, 'KTTA', 350, 4.50, 3.66,  294.00, 18.6667, 291.35::numeric, '09:41'::time, '11:20'::time, 'Push à 4,62 rejeté sous la résistance de 4,65 (high PM). Deuxième entrée sur le rejet, cover moitié à 3,78, le reste après le flush de midi.', 'Couvert la 2e moitié trop tôt : LOD à 3,41, objectif à 3,36 abandonné par peur du rebond.'),
      ('2026-09-16'::date, 'BNZI', 500, 2.84, 2.61,  115.00,  8.0986, 113.80::numeric, '09:47'::time, '10:32'::time, 'Fade propre après l''open, SSR déclenché en fin de matinée.', NULL),
      ('2026-09-15'::date, 'SNTG', 200, 6.10, 6.72, -124.00,-10.1639, NULL::numeric,   '09:38'::time, '09:55'::time, 'Squeeze au-dessus du high PM, stop touché.', 'Entrée trop tôt, pas attendu le rejet du push.'),
      ('2026-09-12'::date, 'NUWE', 400, 3.25, 2.70,  220.00, 16.9231, NULL::numeric,   '09:44'::time, '11:05'::time, 'Rejet net sous 3,40, tenu jusqu''au flush.', NULL),
      ('2026-09-11'::date, 'HOTH', 250, 7.40, 7.28,   30.00,  1.6216, NULL::numeric,   '11:12'::time, '15:55'::time, 'Peu de mouvement, sorti à l''EOD.', 'Entrée après 11h — setup déjà essoufflé.'),
      ('2026-09-10'::date, 'AEHL', 600, 1.92, 2.21, -174.00,-15.1042, NULL::numeric,   '09:33'::time, '09:48'::time, 'Squeeze violent à l''open (+30 %).', 'Float trop petit (3,4 M) : squeeze prévisible.'),
      ('2026-09-09'::date, 'CRKN', 300, 5.05, 3.98,  321.00, 21.1881, NULL::numeric,   '09:36'::time, '12:10'::time, 'Fade continu toute la matinée, LOD à −23 %.', NULL),
      ('2026-09-08'::date, 'TOP',  150, 8.60, 8.12,   72.00,  5.5814, NULL::numeric,   '09:52'::time, '10:41'::time, 'Petit fade, gros float.', NULL)
    ) AS v(d, ticker, size, avg_in, avg_out, pnl, gain, pnl_real, t_in, t_out, note, err)
  LOOP
    SELECT id INTO sid FROM stat_entry WHERE user_id = uid AND trade_date = t.d AND ticker = t.ticker;
    INSERT INTO trade_entry (user_id, trade_date, ticker, direction, pattern, size, open_price, exit_price,
                             profit_dollars, real_profit_dollars, gain_percent, note, error_note, stat_entry_id)
    VALUES (uid, t.d, t.ticker, 'SHORT', 'GUS', t.size, t.avg_in, t.avg_out, t.pnl, t.pnl_real, t.gain, t.note, t.err, sid)
    RETURNING id INTO tid;

    IF t.ticker = 'KTTA' THEN
      INSERT INTO trade_execution (trade_entry_id, seq, kind, shares, price, executed_at) VALUES
        (tid, 0, 'ENTRY', 200, 4.41, '09:41'), (tid, 1, 'ENTRY', 150, 4.62, '09:58'),
        (tid, 2, 'EXIT',  150, 3.78, '10:26'), (tid, 3, 'EXIT',  200, 3.57, '11:20');
    ELSE
      INSERT INTO trade_execution (trade_entry_id, seq, kind, shares, price, executed_at) VALUES
        (tid, 0, 'ENTRY', t.size, t.avg_in, t.t_in), (tid, 1, 'EXIT', t.size, t.avg_out, t.t_out);
    END IF;

    INSERT INTO account_movement (user_id, type, amount, value_date, note, trade_entry_id)
    VALUES (uid, 'TRADE', COALESCE(t.pnl_real, t.pnl), t.d, t.ticker, tid);
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
