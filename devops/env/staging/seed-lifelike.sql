-- Lifelike staging data (#730) — about six months of GUS and double tops, trades on a subset, their
-- locates and an account that reconciles with them. **Staging only, never production** : these rows
-- are fabricated. Their figures are shapes for the interface and the aggregations, not an edge —
-- nothing read off them belongs in a trading decision.
--
--   psql "postgresql://…pooler.supabase.com:5432/postgres?sslmode=require" -v ON_ERROR_STOP=1 \
--     -v env=staging -v email=you@example.com -f devops/env/staging/seed-lifelike.sql
--
-- What it does, in one transaction, for the user [email] (log in once first) :
--   1. **wipes** that user's stats, trades, locates, account movements and reconciliations — the
--      candidates and the « nothing today » marks are left alone ;
--   2. writes 2026-04-20 → 2026-10-19 : weekdays only, US holidays off, days with nothing ; GUS
--      (Open · Push · Sink, no-push days, runners, Sinks not read) and double tops (breakouts,
--      Sinks that barely fell, sessions that rallied). The double tops before 2026-10-12
--      (`DT_DROP_SINCE`) are ticked without a Sink, the later ones carry it — one breakout among
--      them ; the last day is still to complete ;
--   3. trades about a third of the completed stats, short, with commissions in the broker P&L and
--      stop-outs and scratches among them ; a locate per traded day, some never used ; deposits and
--      a withdrawal. Every TRADE / LOCATE movement is the one the app would have written.
--
-- **Every row is marked** : `[seed #730]` opens the note of each stat, trade, locate and manual
-- movement — a TRADE or LOCATE movement keeps the ticker as its note, like the app writes it, and is
-- found through its trade or its locate :
--   SELECT count(*) FROM stat_entry WHERE note LIKE '[seed #730]%';
--
-- Deterministic (`setseed`) : replayed, it writes the same set. Matches the schema up to V29 ; a
-- migration that changes these tables updates this file in the same PR.

\if :{?env}
\else
  \echo 'Pass -v env=staging : this script wipes the user''s data and writes fabricated rows.'
  \quit
\endif
\if :{?email}
\else
  \echo 'Pass -v email=<the staging user> : the rows are written for that user.'
  \quit
\endif

BEGIN;

SELECT set_config('seed.env', :'env', true), set_config('seed.email', :'email', true);

-- ---------------------------------------------------------------------------------------- helpers

/** Uniform in [lo, hi). */
CREATE FUNCTION pg_temp.u(lo numeric, hi numeric) RETURNS numeric LANGUAGE sql AS
$$ SELECT lo + (hi - lo) * random()::numeric $$;

/** Normal (Box-Muller) — `random_normal` is PostgreSQL 16+. */
CREATE FUNCTION pg_temp.n(mu numeric, sigma numeric) RETURNS numeric LANGUAGE sql AS
$$ SELECT mu + sigma * (sqrt(-2 * ln(1 - random())) * cos(2 * pi() * random()))::numeric $$;

/** Log-normal around [median], [spread] the sigma of its log. */
CREATE FUNCTION pg_temp.ln(median numeric, spread numeric) RETURNS numeric LANGUAGE sql AS
$$ SELECT exp(pg_temp.n(ln(median), spread)) $$;

CREATE FUNCTION pg_temp.chance(p numeric) RETURNS boolean LANGUAGE sql AS
$$ SELECT random() < p $$;

CREATE FUNCTION pg_temp.clamp(x numeric, lo numeric, hi numeric) RETURNS numeric LANGUAGE sql AS
$$ SELECT least(greatest(x, lo), hi) $$;

/** A quote : four decimals under a dollar, two above. */
CREATE FUNCTION pg_temp.px(x numeric) RETURNS numeric LANGUAGE sql AS
$$ SELECT CASE WHEN x < 1 THEN round(x, 4) ELSE round(x, 2) END $$;

/** [minutes] after the bell, to the minute, never past 15:59. */
CREATE FUNCTION pg_temp.at(minutes numeric) RETURNS time LANGUAGE sql AS
$$ SELECT least(time '09:30' + make_interval(mins => round(minutes)::int), time '15:59') $$;

/** A small-cap-looking symbol, three or four letters. */
CREATE FUNCTION pg_temp.symbol() RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(chr(65 + floor(random() * 26)::int), '')
  FROM generate_series(1, CASE WHEN random() < 0.7 THEN 4 ELSE 3 END)
$$;

-- -------------------------------------------------------------------------------------- the seed

DO $$
DECLARE
  marker   constant text := '[seed #730]';
  first_day constant date := '2026-04-20';
  last_day  constant date := '2026-10-19';
  drop_since constant date := '2026-10-12';  -- StatEntry.DT_DROP_SINCE
  holidays constant date[] := ARRAY['2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07']::date[];
  gus_notes constant text[] := ARRAY[
    'Push rejeté sous le PM high', 'Offering possible, surveiller les filings', 'Float serré',
    'Pas de news, gap sur rien', 'Locate cher', 'Résistance nette au PM high', 'Volume faible à l''open',
    'Squeeze en fin de matinée', 'Gros float, fade lent'];
  dt_notes constant text[] := ARRAY[
    'Echo sous l''Apex, rejet propre', 'Rejection molle', 'Deuxième sommet plus bas',
    'Volume en baisse sur l''Echo'];
  loss_notes constant text[] := ARRAY[
    'Entrée avant la confirmation', 'Stop trop serré', 'Short contre la tendance du marché',
    'Ajouté dans la force'];

  uid uuid;
  d date;
  i int;
  gus_today int;
  dt_today int;
  dt_index int := 0;
  sym text;
  sid uuid;
  tid uuid;
  lid uuid;
  completed timestamptz;

  -- GUS
  prev numeric; pmo numeric; pmh numeric; flt numeric; vol numeric;
  o numeric; push numeric; hod numeric; lod numeric; eod numeric; sink numeric;
  push_t time; sink_t time; lod_before_push boolean; no_push boolean; not_read boolean;
  runner boolean; fades boolean;

  -- DT
  s numeric; top numeric; low numeric; retest numeric; dt_drop numeric;
  s_t time; top_t time; low_t time; retest_t time; drop_t time;
  shape text;

  -- trades
  entry_px numeric; exit_px numeric; shares int; e1 int; x1 int; e1_px numeric; e2_px numeric;
  x1_px numeric; x2_px numeric; avg_in numeric; avg_out numeric; profit numeric; fees numeric;
  real_profit numeric; t_in time; t_out time; outcome text; locate_shares int;
BEGIN
  IF current_setting('seed.env') <> 'staging' THEN
    RAISE EXCEPTION 'env must be staging, not %', current_setting('seed.env');
  END IF;
  uid := (SELECT id FROM app_user WHERE email = current_setting('seed.email'));
  IF uid IS NULL THEN
    RAISE EXCEPTION 'no user % — log in once first', current_setting('seed.email');
  END IF;

  -- 1. The slate : the recette rows go, the candidates and the trading-day marks stay.
  DELETE FROM account_reconciliation WHERE user_id = uid;
  DELETE FROM account_movement WHERE user_id = uid;
  DELETE FROM locate WHERE user_id = uid;
  DELETE FROM trade_entry WHERE user_id = uid;  -- executions and screenshots cascade
  DELETE FROM stat_entry WHERE user_id = uid;

  PERFORM setseed(0.730);

  -- 2. The account opens the Friday before the first stat.
  INSERT INTO account_movement (user_id, type, amount, value_date, note) VALUES
    (uid, 'DEPOSIT', 25000, first_day - 3, marker || ' Dépôt initial'),
    (uid, 'DEPOSIT', 3000, '2026-06-01', marker || ' Renfort'),
    (uid, 'ADJUSTMENT', -59, '2026-07-01', marker || ' Plateforme ZeroPro'),
    (uid, 'DEPOSIT', 2000, '2026-08-03', marker || ' Renfort'),
    (uid, 'ADJUSTMENT', -59, '2026-09-01', marker || ' Plateforme ZeroPro'),
    (uid, 'WITHDRAWAL', -1500, '2026-09-15', marker || ' Retrait');

  FOR d IN SELECT g::date FROM generate_series(first_day, last_day, interval '1 day') g LOOP
    CONTINUE WHEN extract(isodow FROM d) > 5 OR d = ANY (holidays);
    -- The last day is today's : its session is still to type.
    completed := CASE WHEN d = last_day THEN NULL ELSE d + time '16:20' END;

    -- Days with nothing at all ; the week after the boundary always has its double tops.
    CONTINUE WHEN d < drop_since AND pg_temp.chance(0.2);

    gus_today := CASE WHEN d = last_day THEN 1 ELSE 1 + floor(pg_temp.ln(0.9, 0.6))::int END;
    dt_today := CASE
      WHEN d >= drop_since THEN 2
      WHEN pg_temp.chance(0.22) THEN 1
      ELSE 0 END;

    -- ---------------------------------------------------------------------------------- GUS
    FOR i IN 1 .. least(gus_today, 4) LOOP
      LOOP
        sym := pg_temp.symbol();
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM stat_entry WHERE user_id = uid AND trade_date = d AND ticker = sym);
      END LOOP;

      prev := pg_temp.clamp(pg_temp.ln(1.6, 0.7), 0.25, 12);
      pmo  := prev * (1 + pg_temp.clamp(pg_temp.ln(0.55, 0.5), 0.15, 3));
      pmh  := pmo * (1 + pg_temp.clamp(pg_temp.ln(0.14, 0.7), 0.01, 1.5));
      flt  := round(pg_temp.clamp(pg_temp.ln(6, 1.1), 0.3, 80), 1);
      vol  := round(flt * pg_temp.clamp(pg_temp.ln(1.1, 0.9), 0.1, 12), 1);
      -- Above the PM high often enough to matter.
      o    := pmh * (1 + pg_temp.clamp(pg_temp.n(-0.09, 0.09), -0.4, 0.2));

      no_push := pg_temp.chance(0.12);
      runner  := NOT no_push AND pg_temp.chance(0.13);
      fades   := NOT runner AND pg_temp.chance(0.84);
      not_read := pg_temp.chance(0.04);
      lod_before_push := NOT no_push AND pg_temp.chance(0.12);

      IF no_push THEN
        push := NULL; push_t := NULL;
        hod := o * (1 + pg_temp.u(0, 0.015));
      ELSE
        push := o * (1 + pg_temp.clamp(pg_temp.ln(0.13, 0.7), 0.01, 2.5));
        push_t := pg_temp.at(pg_temp.u(3, 60));
        hod := CASE WHEN runner THEN push * (1 + pg_temp.u(0.05, 0.8)) ELSE push END;
      END IF;

      IF runner THEN
        lod := o * (1 - pg_temp.u(0, 0.06));
        eod := hod * (1 - pg_temp.u(0.02, 0.2));
      ELSE
        lod := o * (1 - pg_temp.clamp(pg_temp.ln(0.21, 0.45), 0.03, 0.75));
        eod := CASE WHEN fades
          THEN lod + (o - lod) * pg_temp.u(0.05, 0.95)
          ELSE o + (hod - o) * pg_temp.u(0.05, 0.9) END;
      END IF;

      -- The Sink : the lowest print after the push — the LOD, unless the LOD came before it. A
      -- runner's can end above its push (#729).
      IF runner THEN
        sink := least(push * (1 + pg_temp.u(-0.12, 0.15)), hod);
      ELSIF lod_before_push THEN
        sink := lod + (coalesce(push, o) - lod) * pg_temp.u(0.15, 0.7);
      ELSE
        sink := lod;
      END IF;
      sink_t := pg_temp.at(
        extract(epoch FROM coalesce(push_t, time '09:30') - time '09:30') / 60
        + pg_temp.u(15, 380));

      prev := pg_temp.px(prev); pmo := pg_temp.px(pmo); pmh := pg_temp.px(pmh);
      o := pg_temp.px(o); push := pg_temp.px(push); eod := pg_temp.px(eod);
      sink := pg_temp.px(sink);
      hod := greatest(pg_temp.px(hod), o, coalesce(push, o), eod, sink);
      lod := least(pg_temp.px(lod), o, coalesce(push, o), eod, sink);

      INSERT INTO stat_entry (
        user_id, trade_date, pattern, ticker, previous_close, pm_open, pm_high,
        float_millions, volume_millions, note,
        open_price, push_open_price, hod_price, lod_price, eod_price,
        push_open_time, gus_drop_price, gus_drop_time,
        ssr, no_push, drop_not_read, high_institutions, completed_at)
      VALUES (
        uid, d, 'GUS', sym, prev, pmo, pmh, flt, vol,
        marker || CASE WHEN pg_temp.chance(0.3)
          THEN ' ' || gus_notes[1 + floor(random() * array_length(gus_notes, 1))::int] ELSE '' END,
        CASE WHEN completed IS NULL THEN NULL ELSE o END,
        CASE WHEN completed IS NULL THEN NULL ELSE push END,
        CASE WHEN completed IS NULL THEN NULL ELSE hod END,
        CASE WHEN completed IS NULL THEN NULL ELSE lod END,
        CASE WHEN completed IS NULL THEN NULL ELSE eod END,
        CASE WHEN completed IS NULL THEN NULL ELSE push_t END,
        CASE WHEN completed IS NULL OR not_read THEN NULL ELSE sink END,
        CASE WHEN completed IS NULL OR not_read THEN NULL ELSE sink_t END,
        pg_temp.chance(0.15), no_push, completed IS NOT NULL AND not_read, pg_temp.chance(0.04),
        completed)
      RETURNING id INTO sid;

      -- A trade on about a third of the completed GUS — the short goes in on the push.
      CONTINUE WHEN completed IS NULL OR no_push OR NOT pg_temp.chance(0.34);
      entry_px := least(o * (1 + pg_temp.u(0.03, 0.12)), hod);
      outcome := CASE
        WHEN runner OR pg_temp.chance(0.27) THEN 'stop'
        WHEN pg_temp.chance(0.15) THEN 'scratch'
        ELSE 'win' END;
      exit_px := CASE outcome
        WHEN 'stop' THEN least(entry_px * (1 + pg_temp.u(0.06, 0.18)), hod)
        WHEN 'scratch' THEN entry_px * (1 + pg_temp.u(-0.012, 0.012))
        ELSE entry_px - (entry_px - greatest(lod, least(eod, entry_px))) * pg_temp.u(0.25, 0.95) END;
      t_in := pg_temp.at(extract(epoch FROM push_t - time '09:30') / 60 - pg_temp.u(0, 4));
      t_out := pg_temp.at(extract(epoch FROM t_in - time '09:30') / 60 + pg_temp.u(4, 150));

      -- Position size : a few thousand dollars, in hundreds of shares, scaled in once in two.
      shares := greatest(100, round(pg_temp.u(2500, 8000) / entry_px / 100) * 100);
      e1 := CASE WHEN pg_temp.chance(0.5) THEN shares ELSE greatest(100, round(shares * 0.6 / 100) * 100) END;
      IF e1 >= shares THEN e1 := shares; END IF;
      x1 := CASE WHEN outcome = 'win' AND pg_temp.chance(0.5)
        THEN greatest(100, round(shares * 0.5 / 100) * 100) ELSE shares END;
      IF x1 >= shares THEN x1 := shares; END IF;
      e1_px := pg_temp.px(entry_px * (1 - pg_temp.u(0, 0.02)));
      e2_px := pg_temp.px(least(entry_px * (1 + pg_temp.u(0, 0.02)), hod));
      x1_px := pg_temp.px(greatest(least(exit_px * (1 + pg_temp.u(-0.01, 0.01)), hod), lod));
      x2_px := pg_temp.px(greatest(least(exit_px, hod), lod));

      avg_in := round((e1 * e1_px + (shares - e1) * e2_px) / shares, 4);
      avg_out := round((x1 * x1_px + (shares - x1) * x2_px) / shares, 4);
      profit := round((avg_in - avg_out) * shares, 2);
      -- $0.005 a share, $0.49 the order, on each paid fill ; a few cents of regulatory fees.
      fees := (SELECT sum(greatest(0.49, 0.005 * q)) FROM unnest(ARRAY[
                e1, nullif(shares - e1, 0), x1, nullif(shares - x1, 0)]) q WHERE q IS NOT NULL)
              + round(pg_temp.u(0.02, 0.12), 2);
      real_profit := round(profit - fees, 2);

      INSERT INTO trade_entry (
        user_id, stat_entry_id, born_from_stat, trade_date, ticker, pattern, direction, size,
        open_price, exit_price, profit_dollars, gain_percent, real_profit_dollars, note, error_note)
      VALUES (
        uid, sid, true, d, sym, 'GUS', 'SHORT', shares, avg_in, avg_out, profit,
        round(profit / (avg_in * shares) * 100, 4), real_profit,
        marker,
        CASE WHEN outcome = 'stop' AND pg_temp.chance(0.6)
          THEN loss_notes[1 + floor(random() * array_length(loss_notes, 1))::int] END)
      RETURNING id INTO tid;

      INSERT INTO trade_execution (trade_entry_id, seq, kind, shares, price, executed_at)
      SELECT tid, row_number() OVER (ORDER BY n), kind::execution_kind, q, p, t FROM (VALUES
        (1, 'ENTRY', e1, e1_px, t_in),
        (2, 'ENTRY', nullif(shares - e1, 0), e2_px, t_in + interval '3 minutes'),
        (3, 'EXIT', x1, x1_px, t_out),
        (4, 'EXIT', nullif(shares - x1, 0), x2_px, least(t_out + interval '25 minutes', time '15:59'))
      ) AS f(n, kind, q, p, t) WHERE q IS NOT NULL;

      INSERT INTO account_movement (
        user_id, type, amount, value_date, note, trade_entry_id, trade_direction, trade_size)
      VALUES (uid, 'TRADE', real_profit, d, sym, tid, 'SHORT', shares);

      -- The locate came first : a round lot at or above the shares shorted.
      locate_shares := (ceil(shares / 500.0) * 500)::int;
      lid := gen_random_uuid();
      INSERT INTO locate (id, user_id, trading_date, ticker, shares, price_per_share, stock_price,
                          note, created_at, updated_at)
      VALUES (lid, uid, d, sym, locate_shares, round(pg_temp.clamp(pg_temp.ln(0.03, 0.6), 0.005, 0.12), 4),
              pmh, marker, d + time '09:20', d + time '09:20');
      INSERT INTO account_movement (user_id, type, amount, value_date, note, locate_id,
                                    locate_ticker, locate_shares)
      SELECT uid, 'LOCATE', -round(l.price_per_share * l.shares, 2), d, sym, lid, sym, l.shares
      FROM locate l WHERE l.id = lid AND round(l.price_per_share * l.shares, 2) > 0;
    END LOOP;

    -- A locate paid on a stock never shorted, now and then : a pure loss.
    IF completed IS NOT NULL AND pg_temp.chance(0.08) THEN
      sym := pg_temp.symbol();
      lid := gen_random_uuid();
      INSERT INTO locate (id, user_id, trading_date, ticker, shares, price_per_share, stock_price,
                          note, created_at, updated_at)
      VALUES (lid, uid, d, sym, 1000, round(pg_temp.u(0.01, 0.06), 4), round(pg_temp.u(1.5, 6), 2),
              marker || ' Pas shorté', d + time '09:15', d + time '09:15');
      INSERT INTO account_movement (user_id, type, amount, value_date, note, locate_id,
                                    locate_ticker, locate_shares)
      SELECT uid, 'LOCATE', -round(l.price_per_share * l.shares, 2), d, sym, lid, sym, l.shares
      FROM locate l WHERE l.id = lid;
    END IF;

    -- ------------------------------------------------------------------------- double tops
    FOR i IN 1 .. dt_today LOOP
      dt_index := dt_index + 1;
      -- Now and then the day's GUS turns into a double top : the same ticker, from its open.
      sym := NULL;
      IF pg_temp.chance(0.3) THEN
        SELECT ticker, open_price INTO sym, s FROM stat_entry
        WHERE user_id = uid AND trade_date = d AND pattern = 'GUS' AND open_price IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM stat_entry x WHERE x.user_id = uid AND x.trade_date = d
                          AND x.ticker = stat_entry.ticker AND x.pattern = 'DT')
        LIMIT 1;
      END IF;
      IF sym IS NULL THEN
        LOOP
          sym := pg_temp.symbol();
          EXIT WHEN NOT EXISTS (
            SELECT 1 FROM stat_entry WHERE user_id = uid AND trade_date = d AND ticker = sym);
        END LOOP;
        s := pg_temp.clamp(pg_temp.ln(2.4, 0.7), 0.3, 12);
      END IF;

      -- The week since the boundary shows every shape the Sink separates.
      shape := CASE
        WHEN d = drop_since AND i = 1 THEN 'breakout'   -- the breakout carrying a Sink (#729)
        WHEN d = drop_since + 1 AND i = 2 THEN 'not-read'
        WHEN d = drop_since + 2 AND i = 1 THEN 'rallied'
        WHEN d = drop_since + 3 AND i = 2 THEN 'barely'
        WHEN pg_temp.chance(0.14) THEN 'breakout'
        ELSE 'clean' END;

      top := s * (1 + pg_temp.clamp(pg_temp.ln(0.33, 0.5), 0.08, 2));
      low := top * (1 - pg_temp.u(0.09, 0.3));
      retest := CASE shape
        WHEN 'breakout' THEN top * (1 + pg_temp.u(0, 0.07))
        ELSE low + (top - low) * pg_temp.u(0.45, 0.97) END;
      dt_drop := CASE shape
        WHEN 'rallied' THEN retest * (1 + pg_temp.u(0.01, 0.05))
        WHEN 'barely' THEN retest * (1 - pg_temp.u(0.005, 0.03))
        WHEN 'breakout' THEN retest * (1 - pg_temp.u(0.05, 0.25))
        ELSE retest * (1 - pg_temp.clamp(pg_temp.ln(0.15, 0.5), 0.02, 0.5)) END;

      s_t := pg_temp.at(pg_temp.u(0, 200));
      top_t := pg_temp.at(extract(epoch FROM s_t - time '09:30') / 60 + pg_temp.u(5, 70));
      low_t := pg_temp.at(extract(epoch FROM top_t - time '09:30') / 60 + pg_temp.u(4, 50));
      retest_t := pg_temp.at(extract(epoch FROM low_t - time '09:30') / 60 + pg_temp.u(8, 90));
      drop_t := pg_temp.at(extract(epoch FROM retest_t - time '09:30') / 60 + pg_temp.u(10, 160));

      s := pg_temp.px(s); top := greatest(pg_temp.px(top), s);
      low := least(pg_temp.px(low), top); retest := greatest(pg_temp.px(retest), low);
      dt_drop := pg_temp.px(dt_drop);

      INSERT INTO stat_entry (
        user_id, trade_date, pattern, ticker, float_millions, volume_millions, note,
        dt_start_price, dt_top_price, dt_low_price, dt_retest_price, dt_drop_price,
        dt_start_time, dt_top_time, dt_low_time, dt_retest_time, dt_drop_time,
        ssr, drop_not_read, completed_at)
      VALUES (
        uid, d, 'DT', sym,
        round(pg_temp.clamp(pg_temp.ln(7, 1), 0.5, 80), 1),
        round(pg_temp.clamp(pg_temp.ln(9, 0.9), 0.5, 120), 1),
        marker || CASE WHEN pg_temp.chance(0.3)
          THEN ' ' || dt_notes[1 + floor(random() * array_length(dt_notes, 1))::int] ELSE '' END,
        s, top,
        CASE WHEN completed IS NULL THEN NULL ELSE low END,
        CASE WHEN completed IS NULL THEN NULL ELSE retest END,
        CASE WHEN completed IS NULL OR d < drop_since OR shape = 'not-read' THEN NULL ELSE dt_drop END,
        s_t, top_t,
        CASE WHEN completed IS NULL THEN NULL ELSE low_t END,
        CASE WHEN completed IS NULL THEN NULL ELSE retest_t END,
        CASE WHEN completed IS NULL OR d < drop_since OR shape = 'not-read' THEN NULL ELSE drop_t END,
        pg_temp.chance(0.15), shape = 'not-read' AND completed IS NOT NULL, completed)
      RETURNING id INTO sid;

      -- Fewer double tops are traded : short on the Echo, out on the Sink or stopped over the Apex.
      CONTINUE WHEN completed IS NULL OR NOT pg_temp.chance(0.3);
      entry_px := retest;
      -- Stopped over the Apex on a breakout or a rally, and now and then on a clean one that came
      -- back up before it fell.
      exit_px := CASE
        WHEN shape IN ('breakout', 'rallied') OR pg_temp.chance(0.3)
          THEN top * (1 + pg_temp.u(0.02, 0.08))
        ELSE retest - (retest - dt_drop) * pg_temp.u(0.3, 0.9) END;
      t_in := retest_t;
      t_out := least(drop_t, time '15:59');
      shares := greatest(100, round(pg_temp.u(2500, 7000) / entry_px / 100) * 100);
      avg_in := pg_temp.px(entry_px);
      avg_out := pg_temp.px(exit_px);
      profit := round((avg_in - avg_out) * shares, 2);
      fees := 2 * greatest(0.49, 0.005 * shares) + round(pg_temp.u(0.02, 0.12), 2);
      real_profit := round(profit - fees, 2);

      INSERT INTO trade_entry (
        user_id, stat_entry_id, born_from_stat, trade_date, ticker, pattern, direction, size,
        open_price, exit_price, profit_dollars, gain_percent, real_profit_dollars, note)
      VALUES (
        uid, sid, true, d, sym, 'DT', 'SHORT', shares, avg_in, avg_out, profit,
        round(profit / (avg_in * shares) * 100, 4), real_profit, marker)
      RETURNING id INTO tid;
      INSERT INTO trade_execution (trade_entry_id, seq, kind, shares, price, executed_at) VALUES
        (tid, 1, 'ENTRY', shares, avg_in, t_in),
        (tid, 2, 'EXIT', shares, avg_out, t_out);
      INSERT INTO account_movement (
        user_id, type, amount, value_date, note, trade_entry_id, trade_direction, trade_size)
      VALUES (uid, 'TRADE', real_profit, d, sym, tid, 'SHORT', shares);
    END LOOP;
  END LOOP;

  RAISE NOTICE 'seed #730 : % stats (% DT), % trades, % locates, balance %',
    (SELECT count(*) FROM stat_entry WHERE user_id = uid),
    (SELECT count(*) FROM stat_entry WHERE user_id = uid AND pattern = 'DT'),
    (SELECT count(*) FROM trade_entry WHERE user_id = uid),
    (SELECT count(*) FROM locate WHERE user_id = uid),
    (SELECT sum(amount) FROM account_movement WHERE user_id = uid);
END $$;

COMMIT;
