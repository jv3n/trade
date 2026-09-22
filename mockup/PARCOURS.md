# User journey — trading tracker

Working document for redefining the app. It describes the trading day as it actually happens, step
by step, and what the app has to capture at each one. The mockups (`index.html`) follow this
document. Their copy stays in French, because the interface is.

Legend : ✅ defined · 🟡 in progress · ❓ to define

---

## Context

- **Strategy : the GUS** (*Gap Up Short*) for now — shorting a US small-cap that gapped up in
  premarket with no fundamental behind it, betting on the price coming back. Reference in
  [`docs/pattern/GUS.md`](../docs/pattern/GUS.md) (price $1–10, gap ≥ +50 %, float 3–50 M, flat or
  downtrend chart, weak company, moderate PM volume, no reverse split).
- **Broker : TradeZero.**
- **Spotting : the radar** (an external tool) finds the day's tickers. The app doesn't replace the
  radar, it records what comes out of it.

### Pattern

The **candidate**, the **stat** and the **trade** each carry a **pattern** (typed on the candidate,
inherited by the stat and then by the trade). Only GUS is traded at first, but the list is planned
now — and it **will grow over time** (DT and others will come) :

| Value | Label | Description |
|-------|-------|-------------|
| `GUS` | Gap Up Short | Shorting a premarket gap up with no fundamental. **Default.** |
| `DT` | Double Top | Shorting a double top. |
| `DISCRETIONARY` | Discretionary | A trade with no pre-established pattern. |

### The life cycle : candidate → stat → trade

```
Candidate (morning) ──[ action : « → Stat » ]──▶ Stat ──[ action : « → Trade » ]──▶ Trade (journal)
```

- Each step is a **manual action** : I decide.
- In practice, **almost every candidate becomes a stat** (hence a "promote them all" button). Only
  some stats become a trade.
- A candidate that is not promoted stays in the day's history.

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
lexicon is a reference. The future monitoring / charts tab will sit between Journal and Account.

**The morning reconciliation happens right inside step 1** : app balance, typed TradeZero balance,
live gap, and a button to validate (or to create the correction when there is a gap). No need to
open the account page in the morning.

**Screen** : [`aujourdhui.html`](aujourdhui.html). The mockup has an « 8h00 / 16h15 » toggle to see
the page at two moments of the day.

---

## Step 1 — Capturing the candidates (morning) ✅

**When** : in premarket, right after the radar screen, before the open.

**What I type in** (everything known at that point) :

| Data | Example | Source / detail |
|------|---------|-----------------|
| Pattern | GUS | Defaults to GUS (cf. the enum above) |
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
- Previous close, PM open and PM high are mandatory (PM high ≥ PM open) ; float, volume, locate and
  note are optional.
- Locate / price turns amber above 5 % (heavy borrowing cost).
- Past days are read-only (history).

### At the open (9:30)

Once the market opens, an **« À l'open »** card lists the day's candidates. For each one I type the
**open** and adjust the **target push**, because the average is only a starting point : how far a
push runs depends on the stock. It tells me where to look for the push and whether I go for the
trade.

- **Target price** = open × (1 + target push), computed live, with the gap in $ and where the PM
  high stands vs the open (the PM high is often the resistance).
- **The target push starts from a reference**, picked above the card among the push at the open of
  the completed stats of the same pattern : **median, average (default), 3rd quartile, max**.
- A row keeps following the reference until I type another percentage in it ; a typed value stays
  specific to that candidate, and a « back to the reference » button undoes it (so does typing the
  reference's value back or emptying the field). Switching the reference moves only the rows still
  on it ; the selected reference itself is a display setting, not stored.
- **Stored on the candidate** : the open and the typed target push (none = follows the reference),
  saved when leaving the field — an edit, no modal. The target price is recomputed, never stored.
- Both are optional : a candidate without an open simply shows no target price, and without any
  completed stat for the pattern there is no reference.
- A target push **above 100 %** is shown in amber — a small cap can push 200 % and more, so it is
  kept, but it is rare enough to deserve a second look. Past **1000 %** it is a typo and is capped.
- Past days are read-only : the card shows what was typed that morning.
- Deleting a candidate deletes its open and target push with it. A stat already created keeps its
  own copy of the open ; the target push is a plan and doesn't go to the stat.

**Screen** : [`candidat.html`](candidat.html) — quick entry at the top (live gap / push preview),
the « À l'open » card (open, target push, target price), the day's candidates sorted by gap,
a « → Stat » button per row and a "promote them all" button, day-by-day navigation.

---

## Step 2 — Candidate → stat ✅

- **Only through an action button** : « → Stat » on a candidate row, or "promote them all". Nothing
  is created automatically. (A stat can also be typed from scratch on the stats page, for a chart
  found afterwards — see step 5.)
- The stat **takes every field of the candidate** (pattern, ticker, previous close, PM open / high,
  gap, PM push, float, volume, locate, note, open) — not the target push, which is a plan.
- A candidate promoted before 9:30 has no open yet : the open typed on it afterwards also fills its
  stat, as long as the stat's open is still empty.
- The stat is created "to complete" : the session data arrives at step 5.

**Decided** :

- A candidate already promoted shows "in stats" and cannot be promoted twice (refused).
- "Promote them all" only handles the candidates missing from the sheet ; the ones already there are
  left alone without failing the batch. The action is safe to replay.
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

**What the app computes** : push at the open %, HOD %, LOD %, EOD %, all **vs the open** — e.g. push
at the open (4.62 − 4.20) ÷ 4.20 = +10.0 %.

**Removed** from the old sheet : institutional % and "> 20 % institutional". It is a GUS condition
filtered upstream : a ticker with heavy institutional ownership never becomes a candidate, so the
figure adds nothing to the stat. Removed too : the RADAR / MANUAL / IMPORT origin and the stats set
shared between users — a stat always belongs to its user.

**Decided** :

- One stat per day and per ticker (like the candidates) ; a second one is refused.
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

- The premarket is a **card of its own**, above the session one and built the same way : previous
  close, PM open, PM high, float, volume, locate, note, **editable** and saved field by field, gap
  and PM push shown live under their fields. Copied from the candidate at promotion, it can be fixed
  on the stat ; the stat keeps its own copy, the candidate is left alone.
- **« New stat »** opens the two cards empty, with the **date** (any day up to today, never a future
  one), the pattern and the ticker on top : going through the charts, I find a ticker that matched
  my pattern a few days ago and never made it to my candidates — leaving it out would bias the stats
  towards the days I happened to be watching.
- **« Create the stat »** asks for confirmation (it creates something) and needs the date, the
  ticker and the three premarket prices. Same rules as any stat : one per day and per ticker, ticked
  by hand once complete, « → Trade » available. It has no source candidate.
- **No « Save » button** : each card shows where it stands next to its title — « saving… », then
  « ✓ saved at 09:42 », or in red « not saved — … » when the server refuses (PM high under the PM
  open, HOD under the LOD). Typing stays fast during the session, and it is always clear what is in.

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
- The « À l'open » card is left alone : it is a quick calculation aid, the analysis lives in the
  stats. Its references are built on the push at the open, which a no-push stat doesn't have, so
  they already leave these days out.

**Screen** : [`stats.html`](stats.html) — a « Premarket » card and a « Session » card for the stat
being filled (live percentage preview, fields saved one by one with the save state next to each
title, "n / 5 prices" — 4 with « No push » — and the check button), a « New stat » button, a table
with the premarket data, the session data (partial for the stats in progress),
the flags, the check column, and a « → Trade » button or a link to the existing trade.

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

**Morning reconciliation** (every morning) : I type in the balance TradeZero displays, the app
compares it with the computed one. No gap → the reconciliation is simply timestamped. A gap → a
"correction" line puts the balance on the TradeZero figure. It catches whatever the adjusted P&L
figures didn't cover (borrowing fees, rounding…).

**Screen** : [`compte.html`](compte.html) — USD / CAD balance, the morning reconciliation panel
(live gap), the history of the last reconciliations, the balance curve, the movements list.

---

## Implementation

The recode is broken down into GitHub issues **#184 to #205** (pattern enum, confirmation modal,
candidates, stats, journal, account, Today page, navigation, settings, icons, colours…). Each issue
describes its scope, its acceptance criteria, the reference mockups and its dependencies.
Implementation decisions : the pattern is an **enum** in the code, and the **database restarts
empty** (no data migration).
