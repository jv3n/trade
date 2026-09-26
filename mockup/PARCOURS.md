# User journey — trading tracker

Working document for redefining the app. It describes the trading day as it actually happens, step
by step, and what the app has to capture at each one. The mockups (`index.html`) follow this
document. Their copy stays in French, because the interface is.

Legend : ✅ defined · 🟡 in progress · ❓ to define

---

## Context

- **Strategy : the GUS** (*Gap Up Short*) for now — shorting a US small-cap that gapped up in
  premarket with no fundamental behind it, betting on the price coming back. Reference in
  [`docs/pattern/GUS.md`](../docs/pattern/GUS.md) (price ~$0.30–10, gap ≥ +45 %, float ≥ 1.5 M,
  institutions < 20 %, flat or downtrend daily, weak company, moderate PM volume, no reverse split).
  The other sheets sit beside it — `DT.md`, `SIR.md`, `penny-break.md` ; `SIV.md` is still to write
  (#417). What is not a pattern lives in `docs/notes/` : `execution-signals.md` (the entry
  signals), `four-sellers.md` (the frame to judge any short) and `stop-rule.md` (stretching a stop to
  a nearby level).
- **Broker : TradeZero.**
- **Spotting : the radar** (an external tool) finds the day's tickers. The app doesn't replace the
  radar, it records what comes out of it.

### Pattern

The **stat** and the **trade** carry a **pattern** — **chosen when the candidate is promoted**,
inherited by the trade. **A candidate has no pattern** (#428) : it is the ticker of the day and its
premarket, not yet assigned to a setup — the same ticker can give a GUS in the morning and a double
top late in the morning. The list is planned now and **will grow over time**, but **only GUS and DT
are worked on for now** (#428) : the other values stay in the enum, with no screen of their own :

| Value | Label | Description |
|-------|-------|-------------|
| `GUS` | Gap Up Short | Shorting a premarket gap up with no fundamental. **Default.** |
| `DT` | Double Top | Shorting a double top. |
| `SIR` | Short Into Resistance | Shorting into a resistance level (previous day's high, PM high, round number). |
| `SIV` | Short Into VWAP | Shorting a bounce back up into the VWAP from below. |
| `DISCRETIONARY` | Discretionary | A trade with no pre-established pattern. |

### The life cycle : candidate → stat → trade

```
Candidate (morning) ──[ action : « → GUS » / « → DT » ]──▶ Stat ──[ action : « → Trade » ]──▶ Trade (journal)
```

- Each step is a **manual action** : I decide.
- In practice, **almost every candidate becomes a stat** (hence a "promote them all" button). Only
  some stats become a trade.
- A candidate that is not promoted stays in the day's history.
- **One stat per pattern** (#428) : a candidate promoted as a GUS in the morning can form a
  **double top** late in the morning — two setups on the same ticker and day, so a GUS stat *and* a
  DT stat, each with its own trade if taken.

---

## The typical day

| # | When | What I do | What the app captures | Status |
|---|------|-----------|-----------------------|--------|
| 1 | Morning, premarket | Log into TradeZero, screen on the radar, pick the tickers | The day's **candidates** | ✅ |
| 2 | Morning | I keep the candidates worth following | Candidate → **stat** (button) | ✅ |
| 3 | Session | At 9:30, I note each candidate's open, adjust the target push and read the target price ; then I take trades on TradeZero, or I don't | The candidates' **open** and **target push** ; the stats as the day goes (push, flags) | ✅ |
| 4 | After the session | I go over my trades | Stat → **trade** (button) : executions, post-mortem, screenshot | ✅ |
| 5 | During the day, then the 4 pm close | I note how the day's tickers behaved, then check each stat once complete | The **stats sheet**, each stat checked by hand | ✅ |
| 6 | Every morning + as it goes | Reconciling the balance with TradeZero, deposits, withdrawals | The **account** | ✅ |

---

## Home — « Aujourd'hui » ✅

The home page follows the typical day : each step with its state (**done** / **current** / **to
do**), the time it was done at, and a button to the screen concerned. The state is derived from the
data : reconciliation validated this morning, candidates captured, stats still to complete, and so
on. Beside it : the balance (reconciled or not), the P&L of the day / week / month, the day's
candidates, the week's trades.

**Menu order** : Today · Candidates · Stats · Journal · Account · (apart, at the bottom) Lexicon.
Candidates → Stats → Journal follows the life cycle of a ticker (each « → Stat » / « → Trade »
button leads to the next tab) ; the account is a ledger consulted now and then, not a step ; the
lexicon is a reference at hand, outside the trading day. The calculators are not in the menu : they
float, from the top bar's launcher. The future
monitoring / charts tab will sit between Journal and Account.

**The morning reconciliation happens right inside step 1** : app balance, typed TradeZero balance,
live gap, and a button to validate (or to create the correction when there is a gap). No need to
open the account page in the morning. Most mornings TradeZero shows the app's own balance : an
**« Aucun écart »** button next to it reconciles at the computed balance in one click, nothing to
type, no confirmation (a clean morning creates no correction) (#407).

**Each step's title, text and action describe the same job** (#337) :

- **Capture the candidates** (step 2) is done once **every** captured candidate is in the stats
  sheet — has at least one stat, whatever its pattern (#428) — capturing one is not enough. It carries the « Promote the N left » action : promotion is
  morning work, before the session the stats are filled during.
- **Complete the stats** (step 4) counts **every** stat still to complete, the earlier days
  included — a stat left half-filled on a previous day stays visible here until it is ticked. The
  earlier days are listed in amber (« Overdue : GLND (21/09), KTTA (17/09) »), even in the morning ;
  the day's own stats are normal until the close. Its single action opens the stats sheet, where the
  session panel opens on the first stat to complete. The step is done once none is left, any day.

**A quiet day can be done too** (#407). Some days nothing on the radar is worth a candidate, and
many days end without a trade : « nothing today » is an answer, not a step left undone.

- **« Aucun candidat aujourd'hui »** on step 2, while the day has no candidate : steps 2 and 4 read
  « nothing today ». Step 4 only while no stat of an earlier day is still to complete — an overdue
  stat keeps it open, as usual.
- **« Pas de trade aujourd'hui »** on step 5, while the day has no trade : step 5 reads « nothing
  today ». Independent of the first — a day with stats and no trade is the common case.
- **« Aucun écart »** on step 1, for the morning TradeZero shows the app's balance : a real, clean
  reconciliation at the computed balance — step 1 is done (green check), not « nothing today ».
  Same block on the account page. Undone with the reconciliation's own « Annuler ».
- One click, no confirmation (nothing is created or deleted), and **« Annuler »** next to the state.
  Capturing a candidate or entering a trade afterwards overrides the mark : the data wins. The
  step keeps its « Saisir » / « Choisir une stat » link, so a day that turns out busy needs no undo.
- The mark is **stored as declared**, never cleared by the data : deleting the only candidate or
  trade of the day brings the « nothing today » state back, at the time of the original mark. On
  purpose — the declaration was true, and the record of the quiet days stays what the user said.
- The state is **neutral**, a grey dash in the dot — a status, not an outcome, so never green. A
  step in that state counts as done in « n étapes faites sur 5 ».
- The mark is **stored per day** (backend), so it survives a reload or another device, and the quiet
  days stay on record for the stats later. Today only, for now.

**Screen** : [`aujourdhui.html`](aujourdhui.html). The mockup has an « 8h00 / 16h15 / Jour calme »
toggle to see the page at two moments of the day, and on a day with nothing to do.

---

## Step 1 — Capturing the candidates (morning) ✅

**When** : in premarket, right after the radar screen, before the open.

**What I type in** (everything known at that point) :

| Data | Example | Source / detail |
|------|---------|-----------------|
| Ticker | `KTTA` | |
| Previous close | 2.65 | Daily candle |
| Premarket open | 4.05 | First premarket price, **4:00 am** |
| Premarket high | 4.65 | |
| Float | 8.2 M | |
| Volume | 3.1 M | TradeZero, **at capture time** — gives the general idea of the volume, enough to validate the pattern |
| Locate | $0.03 / share | Cost of borrowing the share to short |
| Note | « Résistance 4,65 » | Free text, optional |

**What the app computes** (nothing to type) :

- **Gap %** = (PM open − previous close) ÷ previous close → +52.8 % here.
- **Push %** = (PM high − PM open) ÷ PM open → +14.8 % here.
- **Locate / price** = locate ÷ PM open → the weight of the borrowing cost *(a proposal, to keep or
  not)*.

**Decided** :

- No checkboxes for the qualitative GUS criteria (chart, company, reverse split).
- Nothing about sizing (capital, risk, stop, entry scale, fills, covers) : none of it is known at
  capture time.
- One candidate per day and per ticker : a second entry for the same ticker on the same day is
  refused.
- **No pattern at capture** (#428) : the pattern is chosen when promoting (step 2).
- **A ticker spotted for a DT is captured when it forms**, usually late in the morning, with the
  **same premarket** as the morning ones (previous close, PM open / high, float, volume, locate) — so
  the DT KPIs can be compared with the GUS ones. A ticker already captured that morning is not
  captured again : its DT is a second stat (step 2).
- Previous close, PM open and PM high are mandatory (PM high ≥ PM open) ; float, volume, locate and
  note are optional.
- Locate / price turns amber above 5 % (heavy borrowing cost).
- Past days are read-only (history).

### At the open (9:30)

Once the market opens, an **« À l'open »** card lists the day's candidates — except one whose only
stat is a DT : the target push is a GUS notion (#428). For each one I type the
**open** and adjust the **target push**, because the average is only a starting point : how far a
push runs depends on the stock. It tells me where to look for the push and whether I go for the
trade.

- **Target price** = open × (1 + target push), computed live, with the gap in $ and where the PM
  high stands vs the open (the PM high is often the resistance).
- **The target push starts from a reference**, picked above the card among the push at the open of
  the completed **GUS** stats : **median, average (default), 3rd quartile, max** — with
  the no-push rate of those stats beside them (#332).
- A row keeps following the reference until I type another percentage in it ; a typed value stays
  specific to that candidate, and a « back to the reference » button undoes it (so does typing the
  reference's value back or emptying the field). Switching the reference moves only the rows still
  on it ; the selected reference itself is a display setting, not stored.
- **Stored on the candidate** : the open and the typed target push (none = follows the reference),
  saved when leaving the field — an edit, no modal. The target price is recomputed, never stored.
- Both are optional : a candidate without an open simply shows no target price, and without any
  completed GUS stat there is no reference.
- A target push **above 100 %** is shown in amber — a small cap can push 200 % and more, so it is
  kept, but it is rare enough to deserve a second look. Past **1000 %** it is a typo and is capped.
- Past days are read-only : the card shows what was typed that morning.
- Deleting a candidate deletes its open and target push with it. A stat already created keeps its
  own copy of the open ; the target push is a plan and doesn't go to the stat.

**Screen** : [`candidat.html`](candidat.html) — quick entry at the top (live gap / push preview),
the « À l'open » card (open, target push, target price), the day's candidates sorted by gap,
« → GUS » and « → DT » per row, one badge per stat once promoted (SGBX has both, NXTT was captured
at 11:20 for a DT) — and a "promote them all in GUS" button, day-by-day navigation.

---

## Step 2 — Candidate → stat ✅

- **Only through an action button** : « → GUS » / « → DT » on a candidate row, or "promote them
  all". Nothing
  is created automatically. (A stat can also be typed from scratch on the stats page, for a chart
  found afterwards — see step 5.)
- The stat **takes every field of the candidate** (ticker, previous close, PM open / high, gap, PM
  push, float, volume, locate, note, open) — not the target push, which is a plan — and **the pattern
  of the button** used.
- A candidate promoted before 9:30 has no open yet : the open typed on it afterwards also fills its
  stat, as long as the stat's open is still empty.
- The stat is created "to complete" : the session data arrives at step 5.

**Decided** :

- **The pattern is chosen here** (#428) : « → GUS » in the morning, « → DT » when the double top
  forms — both a creation, so both confirm. A candidate already promoted shows one badge per stat
  (« ✓ GUS », « ✓ DT ») and the button of each pattern it has is gone : it cannot be promoted twice
  in the same pattern (refused). Each badge is a link : it opens the stats page on that stat, its
  panel already open (#383) — right after promoting is when you want to go and fill it.
- The two stats of a candidate take the same premarket, then live their own lives.
- Only GUS and DT have a button : SIR, SIV and discretionary are measured like a GUS, so a stat is
  re-filed into them on the stats page (step 5).
- "Promote them all" makes **GUS** stats of the candidates **without any stat** ; the others are
  left alone without failing the batch — a DT stays a choice made by hand. The action is safe to
  replay.
- The stat keeps a link back to its candidate. Deleting that candidate later does not delete the
  stat : the link is simply cleared.

---

## Step 3 — Session ✅

**The app is barely used during the session.** Everything happens on TradeZero ; the app comes
before (the morning's candidates, their open and target push at 9:30 — cf. step 1), alongside (a
stat can be filled as the day goes — cf. step 5) and after (the stats checked at 4 pm, the trades in
the journal). As a consequence : no real-time screen, no live position tracking.

---

## Step 4 — Stat → trade (journal) ✅

- **Only through the « → Trade » action button** on a stat row. No blank trade can be created from
  the journal.
- The trade **inherits the stat's pattern** and shows its context (premarket + session), read-only.
  If the stat's pattern is changed later, **the trade follows** (#393) : it is a filing correction,
  not a different decision.

**What I type in on the trade** :

| Block | Content |
|-------|---------|
| Executions | Time, kind (short / cover), share count, price — one row per TradeZero fill |
| Post-mortem | "What happened" + "Mistake / to improve" |
| Chart screenshot | One image (PNG / JPEG / WebP, 5 MB max) |

**What the app computes** : position, average entry / exit (and their distance to the open), P&L in
$ and %, duration of the trade.

**Adjustable P&L** : the P&L is computed from the executions, but I can type in the **real P&L** of
the TradeZero statement to absorb the broker's fees and rounding (a few cents to a few dollars — I
don't know the exact fees in advance). The app shows the computed one, the real one and the gap. The
**retained P&L** (the real one if typed, else the computed one) is what reaches the account.
The real P&L can only be typed **once the position is closed** : on an open or partial position the
field is greyed out, since no exit backs the amount yet.

**Saving** : the trade sheet is edited as a whole and saved with the « Save » bar that shows up as
soon as something changed. Leaving the page with changes not saved asks first (« Leave without
saving? ») — a nav click, the back button, closing or reloading the tab — so a debrief is never lost
silently.

**Removed** : the pre-trade checklist, the "execution" block (front / back side, short on
resistance, exit strategy), play A / B, the risk indicators (budget, R multiple).

**Screens** : [`journal.html`](journal.html) (list + KPIs, pattern filter) and
[`trade.html`](trade.html) (the trade sheet).

---

## Step 5 — Filling and checking the stat (during the day, then 4 pm) ✅

**When** : as the day goes — the open at 9:30 (already there when it came from the candidate), the
push once it has happened, the flags as they come — and the rest after the 4 pm close.

**What I type in** (in $, share prices), **field by field, in any order** :

| Data | Example | Note |
|------|---------|------|
| Open | 4.20 | Session open — the base of every percentage. **Pre-filled** with the open typed on the candidate at 9:30 |
| Push at the open | 4.62 | **New** — the price reached by the push that follows the open, within ~10 minutes |
| No push | yes / no | The stock never pushed at the open — the push field is greyed out (see below) |
| HOD | 4.62 | High of Day |
| LOD | 3.41 | Low of Day |
| EOD | 3.52 | Close |
| SSR | yes / no | |
| Price < $1 | yes / no | |
| Entry after 11 am | yes / no | Kept even though in theory I shouldn't be doing it |
| Institutions > 20 % | yes / no | More than 20 % of the float held by institutions, read on the broker screen — ticked by hand (#349, #369) |

**What the app computes** : push at the open %, HOD %, LOD %, EOD %, all **vs the open** — e.g. push
at the open (4.62 − 4.20) ÷ 4.20 = +10.0 %.

**Institutional ownership** came back as a flag (#349) — « Institutions > 20 % », ticked by hand
like the other three (#369 fixed a label that read the other way round). Low ownership is a GUS entry
criterion filtered upstream (`docs/pattern/GUS.md`, #7), so the flag is expected to stay unticked
most days ; keeping the trace on the stat is what lets the exceptions be seen later. The **exact percentage** stays out : the flag is the unit of comparison, and the
threshold lives in the label, so it can move without touching the data.

**Removed** from the old sheet : the RADAR / MANUAL / IMPORT origin and the stats set
shared between users — a stat always belongs to its user.

**Decided** :

- One stat per day, per ticker and **per pattern** (#428) ; a second one in the same pattern is
  refused.
- **Each field is saved on its own**, when leaving it — an edit, no modal. A half-filled stat is a
  normal state ; the percentages preview on whatever is filled.
- **Completed is a check I tick myself** (✓, like reviewing a transaction in Monarch), not the
  consequence of the last price landing. The status is **stored**. The check is only possible once
  the five session prices are in, and a click unticks it back to "to complete".
- The check of a completed stat is **green**.
- A checked stat keeps its check when edited, but can't lose a price : clearing one is refused —
  untick it first.
- The KPIs, the averages and the push references of the « À l'open » card only count **checked**
  stats, so a half-filled day doesn't skew them ; the flags default to no.
- No percentage is stored : everything is recomputed from the prices.
- The KPIs on top (completed, average push at the open, average LOD, fade) cover **the whole
  filter**, not the displayed page.
- No CSV import : neither for the stats (a stat is born from a candidate, or typed by hand) nor for
  the journal (a trade is born from a stat). Both keep a CSV **export** — premarket block, session block and flags
  on the stats side (session prices empty for a stat still to complete) ; identity, position,
  executions and the three P&L figures on the journal side.
- "Traded / not traded" filter : shipped with the link to the trade (#193).

**Editing the premarket, and a stat from scratch** (#326) :

- The premarket is a **card of its own**, above the session one and built the same way : the
  **pattern**, previous close, PM open, PM high, float, volume, locate, note, **editable** and saved
  field by field, gap and PM push shown live under their fields. Copied from the candidate at
  promotion, it can be fixed on the stat ; the stat keeps its own copy, the candidate is left alone.
- **The pattern can be changed after the fact** (#393) — a filing mistake, among the patterns
  measured the same way (GUS, SIR, SIV, discretionary). It is a select at the head of the card,
  saved when changed like a flag. **Not to or from DT** (#428) : a double top has prices of its own,
  and a GUS that turns into a double top is a second stat, not a re-filing. The row
  moves under the pattern filter and the KPIs and push references follow ; a trade born from the
  stat takes the new pattern too. The candidate is not concerned : it has no pattern.
- **« New stat »** opens the two cards empty, with the **date** (any day up to today, never a future
  one), the pattern and the ticker on top : going through the charts, I find a ticker that matched
  my pattern a few days ago and never made it to my candidates — leaving it out would bias the stats
  towards the days I happened to be watching.
- **« Create the stat »** asks for confirmation (it creates something) and needs the date, the
  ticker and the three premarket prices. Picking DT swaps the session card for the double top one.
  Same rules as any stat : one per day, per ticker and per pattern, ticked
  by hand once complete, « → Trade » available. It has no source candidate.
- **No « Save » button** : each card shows where it stands next to its title — « saving… », then
  « ✓ saved at 09:42 » (« yesterday at 22:25 », or the date, when the last save is older — #342), or in red « not saved — … » when the server refuses (PM high under the PM
  open, HOD under the LOD). Typing stays fast during the session, and it is always clear what is in.
- **A required premarket price left empty** (#340) — clearing a price to retype it is ordinary, so
  it must never lose anything silently : the field says « required » under itself (amber, like « PM
  high under the PM open »), the premarket card reads « not saved — the three premarket prices are
  required », and since every save sends the whole row, the session card holds too (« not saved —
  waiting for the premarket ») — and the other way round, a HOD under the LOD holds the premarket.
  **Leaving the panel** (« Close », another stat, « New stat ») while an edit never left, whatever
  held it back, asks « Leave without saving ? » ; leaving keeps the last saved values, staying lets
  the value be fixed — which then saves everything.
  **A filter, a page or a sort that takes the open stat off the table** closes the panel (#383) :
  nothing is typed into a row that is not on screen. It doesn't ask — an edit the validation held
  back could never be saved anyway, so it is dropped and a toast says so. As on arrival, the first
  stat to complete of the new list then opens, if there is one. Ticking a stat keeps the panel on it.

**No push at the open** (#302) : some days have everything of a GUS in the premarket but
the stock never pushes after the open — GLND on 2026-09-21 dropped straight from the open and only
came back up around 11 am. A push is expected within ~10 minutes of 9:30 ; a later bounce is not one.
These days are a setup of their own, to trade **right at the open** instead of waiting for a push
that never comes, so they count in the stats and are made easy to single out.

- A **« No push »** checkbox sits right under the push field. Ticking it greys out and empties the
  field ; unticking gives back the value typed before. It is saved when changed, like a flag.
- A no-push stat is **checked with the four other prices** (open, HOD, LOD, EOD) — the panel counts
  « n / 4 prices ». HOD stays required : on a no-push day it is the open or the later bounce.
- In the table, the push column shows a neutral « no push » tag (not an outcome, not a warning).
- The **average push at the open** only counts the stats that pushed, so the 0 % days don't drag it
  down ; its KPI shows the **no-push rate** underneath (« 1 / 11 without a push »). The no-push days
  count in everything else (LOD, fade, EOD).
- A **« No push »** button in the table's filter isolates them, to compare their premarket (gap, PM
  push, float, volume) with the days that pushed.
- On that tab the push KPI has nothing to average, so it becomes **« Days without a push »** (#334) :
  the no-push days over the completed stats of the same period and pattern (« 1 / 11 »), with the
  share underneath (« 9 % of the completed stats »). The rate counts every completed stat, not only
  the tab's rows, so it is computed on the period's summary without the no-push filter — and
  without the search, which would turn it into one ticker over itself. Until it arrives the card
  stays blank rather than showing « — », which would read as the answer. Comparing
  their premarket with the days that pushed (« PM push 12 % vs 18 % ») waits for enough of them to
  mean something (#302).
- The « À l'open » card's references are built on the push at the open, which a no-push stat
  doesn't have, so they leave these days out — and say so (#332) : next to the references, the
  **no-push rate of the same set** (the checked stats of the pattern, « 1 / 11 without a push (9 %) »),
  so a target built on « the average day pushes 9.6 % » doesn't silently assume a push is coming.
  It only informs : the default target push still follows the selected reference. Hidden when no
  day went without a push, like the stats page's KPI.

### The double top stat (#428)

A DT is measured by what makes it (`docs/pattern/DT.md`), not by the GUS session : the **premarket
card stays the same**, the « Session » card becomes a **« Double top »** card of four prices, saved
field by field like the rest.

| Price | Example | Note |
|-------|---------|------|
| Start | 1.90 | Where the push starts — **pre-filled with the open**, moved when it starts from a later low |
| Top | 2.95 | The top of the first push |
| Rejection low | 2.36 | The low of the rejection |
| Retest | 2.85 | The high of the retest, back toward the top |

**What the app computes** — the three legs :

- **A, the extension** = start → top (+55.3 %), and **with the gap**, from the previous close
  (+163 %) — the Trading Desk's stats sheet keeps both, a gap plus a push can make 50 % without an
  intraday 50 %. Amber under **50 %**.
- **B, the rejection** = top → rejection low (−20.0 %). Amber under **17 %** : a normal breath, not a
  rejection.
- **C, the retest** = rejection low → retest (+20.8 %), and its **distance to the top** (−3.4 %, or
  « top taken back ») — a DT often grazes its top without taking it.

- The stat is checked with the **four prices** (« n / 4 prices ») ; same check, same rules.
- The flags stay (SSR, price < $1, entry after 11 am, institutions > 20 %) ; « no push » does not
  apply.
- **The page follows the pattern** : a **GUS / DT / All** switch above the KPIs picks the KPIs, the
  table's columns and the averages. **DT** : completed DT stats, average extension (and with the
  gap), average rejection (and how many reach 17 %), average retest distance to the top (and how
  many took it back) ; the table shows the premarket, then start, A, B, C. **All** keeps what
  compares across patterns — premarket, flags, check, trade — plus a one-line summary of each stat
  in its own pattern, and no averages row : a push at the open and a DT extension don't add up.
- The « À l'open » push references only use GUS stats, as before (same pattern).
- **Data model** — the four DT prices are nullable columns on the stat rather than a table of their
  own, so the database CHECK can keep a ticked stat whole, pattern by pattern (#435).

**Screen** : [`stats.html`](stats.html) — a « Premarket » card and a « Session » card for the stat
being filled (live percentage preview, fields saved one by one with the save state next to each
title, "n / 5 prices" — 4 with « No push » — and the check button), a « New stat » button, a table
with the premarket data, the session data (partial for the stats in progress),
the flags, the check column, and a « → Trade » button or a link to the existing trade. The
« SGBX · GUS / SGBX · DT » switch shows the two panels of one candidate's two stats, the GUS / DT /
All switch the three views of the page.

---

## Tool — Calculators

The **small calculations** a trader redoes by hand — in a phone calculator or out loud — needed
*while* looking at something else : typing a candidate, reading a stat, watching TradeZero. So they
are not a page (#421 removed it) but **floating widgets**, called from anywhere.

- **A launcher in the top bar**, on every page, next to the account : a menu of the five
  calculators. A calculator already open is marked « ouverte » ; picking it again brings it forward
  rather than opening a second one.
- **Each one opens as a floating widget** over the page, under a header : a grip, the title,
  « Détacher », « Fermer ». **A sentence at the top says what the calculator is for** (« Combien
  d'actions shorter pour qu'un stop… ne coûte jamais plus que le risque choisi »). Several can be open
  at once, each closed on its own ; Escape closes the focused one, a click brings it forward.
- **Dragged by its header only** (the body is fields), and kept inside the window — it cannot be lost
  off-screen. No resizing : a widget is about a card's width (380 px).
- **« Détacher »** sends the widget into its own always-on-top window (Document Picture-in-Picture),
  styled and themed like the app, so it stays visible over TradeZero during the session. Closing that
  window puts the widget back in the page. Where the browser lacks the API, the button is absent and
  the widget works in the page.
- **A scratchpad, front only** : no backend, nothing saved, nothing read. The values survive a widget
  closed and opened again, or a trip to another page ; **a reload leaves nothing** — no widget open,
  no value kept (#388). It works on any ticker, including one that is not in the candidates.

**The five calculators** :

1. **Percent move** : from / to → signed percent (`3,23 → 2,70 = −16,4 %`), and the inverse, a price
   and a percent → the resulting price.
2. **Position size** (short) : risk in $, entry, stop → the share count, **rounded down**, and the
   risk actually taken with it. A stop at or below the entry is an amber error, never a negative
   count ; a stop so far that the risk doesn't cover one share says so, rather than « 0 ».
3. **Short P&L** : entry, cover, shares, fees (optional) → the result in $ and in % of the position,
   green / red like the KPI cards (an outcome).
4. **Distance and R:R** : current price, stop, target → the distance to each in % and in $ per share,
   and the R:R (`1 : 1,7`). The stop reads from the price and the stop alone — the target is often
   decided later. A stop under the price or a target above it is an amber error, each its own.
5. **Average price after a scale-in** : shares and price of the first entry and of the add → the new
   average and the total position.

- **Results update as you type**, no « Compute » button. An incomplete card shows `—`, never `0`.
- **Short labels, the unit inside the field** (#408) : « Risque » with `$ US` as a suffix, « Frais »
  with `$ US` and « facultatif » as its placeholder, « 1re entrée » / « Renfort » with `actions`,
  « Variation » with `%`. The risk of the position size gets a row of its own : with its unit inside,
  it needs a field's full width.
- **Both decimal separators** are accepted : the numeric keypad gives `.`, the French layout `,`.
- **Formats of the rest of the app** : percentages to one decimal, prices at the price precision (2
  decimals from $1, 4 below — #311), amounts with `$ US`, share counts grouped.
- **Each result copies in one click, as a bare number** ready to paste into the broker, a
  spreadsheet or a field of the app : no grouping, no currency, a dot for the decimals (`1234.50`,
  #406). For a distance, the $ per share.

**Later** : prefilling from a candidate (previous close, open…).

**Screen** : the launcher and a widget on [`candidat.html`](candidat.html) — the widget drags by its
header.

---

## Reference — Patterns (review sheets)

Outside the daily flow, next to the lexicon : the **pattern sheets** and the **trading notes**, to
reread before the session. **One source** : the app shows the files of `docs/pattern/` and
`docs/notes/` (#417) as they are written — there is no copy of them in the database and no editing in
the app. Revising a sheet means editing its file.

- **Two tabs** (Material tabs) : **Patterns** — GUS, DT, SIR, SIV and the penny break (PB), the files
  of `docs/pattern/` — and **Notes** — the execution signals, the four sellers and the stop rule,
  `docs/notes/`, what is not a pattern. Each tab shows its count.
- **In each tab, an accordion, full width, one expansion panel per file**. Several panels open at
  once ; GUS opens by default.
- **Collapsed**, a panel reads the file's own **title**, its **summary** (the opening quote) and its
  **revision date** (the « Last revised » line) — « Révisée le 25/09/2026 », « Jamais révisée » when
  the file has none (SIV).
- **Expanded** : the rest of the file, rendered — tables, lists, emphasis.
- **In the interface language** : every file has a French twin (`GUS.md` / `GUS.fr.md`) ; the page
  shows the one matching the language set in the preferences.
- **Links between files follow** : a link from a sheet to a note switches to the Notes tab and opens
  that panel, and the other way round. The four sellers are also in the lexicon (« Four Sellers »).
- The files ship **with the app build** (copied into `public/docs/` before each start and build) : a
  sheet updated in the repo shows after the next deploy.
- The design system has neither tabs nor an expansion panel yet : this adds `StbTabsModule` and
  `StbExpansionModule` to `libs/ui`, like every other Material primitive.

**Screen** : [`patterns.html`](patterns.html).

---

## Reference — Lexicon ✅

Outside the daily flow : the glossary of the trading vocabulary (GUS, DT, float, locate, SSR, LOD,
squeeze…), readable at any time.

- **Displayed as cards** (one per term : term, expanded abbreviation, definition), sorted
  alphabetically — validated as is.
- **FR / EN toggle** for the definition.
- **Search** by term + an alphabetical index.
- Read-only : adding, editing and deleting happen in Settings › Lexicon (admin).
- The terms follow the pattern enum : FRD removed, DT added.

**Screen** : [`lexique.html`](lexique.html).

---

## Settings ✅

Reachable from the bottom of the menu (under Lexicon). A secondary menu on the left, four sections :

| Section | For whom | Content |
|---------|----------|---------|
| Preferences | Everyone | Profile + sign out, **theme** (system / light / dark), language (FR / EN), balance display currency (USD / CAD) |
| Access | Admin | Emails allowed to log in (editable list) ; administrators (read-only, set at deploy time) |
| Data | Admin | CSV export of the journal and the stats (**export only**, no import) |
| Lexicon | Admin | Table of terms (term, FR definition, EN definition) : add, edit, delete (confirmed) |
| Ops links | Admin | Consoles and dashboards (billing, production, database, monitoring, GitHub) |

- **The theme is chosen in Preferences only** — no theme button in the menu anymore. "System" (the
  default) follows the computer's light / dark setting, live.
- **The lexicon is edited by the admin, here, and nowhere else.** The Lexicon page is read-only for
  everyone (cards + search + FR / EN).
- **The deployed version** closes the secondary menu, for every role (#380) : the release tag
  (`v2.3.0-rc2`), a chip naming the environment, and underneath the commit and the build time. The
  environment is the backend's own word for where it runs : **`staging`** in indigo (a status, not a
  warning), **`local`** in neutral grey, and **no chip in production**, the normal case. Locally the
  version is where the checkout stands against the last tag (`v2.3.0-rc2-2-g8d53fd2-dirty`), not a
  number kept by hand : the release tag stays the only source. Everything is read from the backend
  (`/actuator/info`), so it always names what is actually running ; if that call fails, the block is
  simply absent. It sits here rather than in the main menu : it is looked up during a validation,
  not glanced at all day.

**Screen** : [`parametres.html`](parametres.html).

---

## Interface principles ✅

- **Confirmation modal** for anything that creates or deletes : « → Stat », "promote them all",
  « → Trade », deleting a candidate or a trade. The modal says what is about to happen (what is
  carried over, what disappears — e.g. the account movement when a trade is deleted). Deletions get
  a red button. No modal for editing, and none for data entry.
- **The morning entry** : validated as is (inline form + live gap / push preview).
- **The stats table** : every column stays, horizontal scrolling is not a problem.
- **Colours** : green / red for outcomes (P&L, amounts, gaps) — plus one status, the green check of
  a completed stat ; amber for warnings (SSR, < $1, expensive locate, to complete) ; indigo for
  statuses and categories (pattern, "in stats") ; the rest neutral, price moves and tickers
  included.
- **Icons** : Material Symbols Rounded — the mapping is in `README.md`.
- **Alignment** : content aligned left (right after the menu), not centred — easier to read. A
  maximum width is kept so the lines don't stretch.
- **Period filter** (stats, journal, account) : one shared control — presets from « today » to
  « last year », « all time », and « custom range », which reveals a from / to date picker. It
  filters the listing and the KPIs alike.
- **Dense forms** : Material fields at 40 px (density -4), and no space reserved under a field until
  there is an error to show.
- **Numeric fields** : focusing one selects its value, so typing replaces it — at 9:30 there is no
  time to clear a field first.
- **A field is emptied in one click** (#414) : a ✕ shows in the field as soon as it holds
  something, and clears it — nothing on an empty field, and out of the tab order, so typing a form
  field by field is unchanged.
- **One setting drives language *and* formats** (#311) — the FR / EN choice of the settings page
  decides the wording, the decimal separator and the date format alike ; the browser locale is only
  the default while nobody is logged in. The machine's regional settings are deliberately **not**
  followed : an English Windows would otherwise print US dates and dots under a French interface,
  which is the contradiction #341 reported. A separate « region » setting can come later if the two
  ever need to differ. Since the locale is read once at start-up, changing the language reloads the
  page.
- **What a KPI counts, it says** (#309) — three pages read the same trading days, so they share one
  vocabulary :
  - a **completed stat** is one that was **ticked** (its five session prices in, four on a no-push
    day). Every stats KPI — the average push, the LOD, the fade — is measured on those, over the
    **filtered set**, never the displayed page. The card shows the total beside the count, so
    « completed » can't be mistaken for « all of them ».
  - a **counted trade** is one carrying a **retained P&L** (closed, or with a broker P&L typed on
    it). An open position has none, so the journal's KPI card counts fewer trades than its table
    lists rows — and says « closed trades » for that reason.
  - a **break-even trade** counts in the journal but leaves **no line on the account** : it moved
    nothing, and the ledger records balance moves. It is the one case where the two counts differ
    by design, so the account says « trades on the account ».
- **Dates : two formats, no more** (#310, #341) — **long** (`fullDate` : « jeudi 17 septembre
  2026 ») for what heads a page or a day, **short** (`shortDate` : « 17/09/2026 ») everywhere else,
  tables and inline text alike. Both follow the language like the numbers do, the date picker
  included, so a French reader never meets `9/17/26` — ambiguous against `17/09`.
- **Numbers** (#311) : prices show 2 decimals from $1 up and 4 below (a $0.42 stock moves in
  fractions of a cent, so the **row** decides : every price of a line follows its own reference
  price — the session open, else the previous close — and a ticker crossing $1 during the day
  doesn't print `1,33` next to `0,9540`, #355), money 2 decimals, percentages 1. Thousands are
  grouped, in the tables **and** in the fields once left — a field strips the grouping while it is
  being typed in (#356). A field pads its value when left, so a
  column of prices lines up on the separator. What is displayed is what is computed : a target
  price follows the **rounded** target push shown next to it, never the unrounded one.

---

## Later — Monitoring & charts

Once the stats have been fed for a while : dashboards and charts to see **what works best** (by
pattern, by gap / float / push bracket, fade rate, trade results vs stats…). **Not now** : the
existing screens come first.

---

## Step 6 — Account ✅

The balance is **derived from the movements** :

| Movement | Origin |
|----------|--------|
| Trade | **Automatic** — every journal trade shows up with its retained P&L (not editable from the account) |
| Deposit / withdrawal | Typed by hand |
| Correction | Created by the **morning reconciliation** |

**The account is denominated in USD** (#312), because TradeZero is : the **CAD toggle converts the
hero balance and the curve only**, and every other amount says « $ US » next to it — the movements
table in its column headers, the KPIs, the reconciliation block and the « add a movement » dialog.
Converting the ledger would leave nothing left to reconcile the broker's own figures against.

**Morning reconciliation** (every morning) : I type in the balance TradeZero displays, the app
compares it with the computed one. No gap → the reconciliation is simply timestamped ; the
**« Aucun écart »** button does it in one click without typing the balance (#407). A gap → a
"correction" line puts the balance on the TradeZero figure. It catches whatever the adjusted P&L
figures didn't cover (borrowing fees, rounding…).

**A typed balance is checked before it rewrites the account** (#307) : a **negative** balance is
refused on the field (the broker never shows one) and the button stays disabled ; a gap **above
20 % of the computed balance** still goes through, but its confirmation says so and reads as a
warning — at that size it is a typo far more often than a real drift.

**Screen** : [`compte.html`](compte.html) — USD / CAD balance, the morning reconciliation panel
(live gap), the history of the last reconciliations, the balance curve, the movements list.

---

## Implementation

The recode is broken down into GitHub issues **#184 to #205** (pattern enum, confirmation modal,
candidates, stats, journal, account, Today page, navigation, settings, icons, colours…). Each issue
describes its scope, its acceptance criteria, the reference mockups and its dependencies.
Implementation decisions : the pattern is an **enum** in the code, and the **database restarts
empty** (no data migration).
