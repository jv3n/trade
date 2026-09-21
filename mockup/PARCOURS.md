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
| 3 | Session | At 9:30, I note each candidate's open and read the target price ; then I take trades on TradeZero, or I don't | The candidates' **open** — nothing else during the session | ✅ |
| 4 | After the session | I go over my trades | Stat → **trade** (button) : executions, post-mortem, screenshot | ✅ |
| 5 | Close, 4 pm | I note how the day's tickers behaved | The completed **stats sheet** | ✅ |
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

Once the market opens, I type each candidate's **open** straight into its row (an edit : saved when
leaving the field, no modal). It tells me where to look for the push and whether I go for the trade.

- **Target price** = open × (1 + average push at the open), computed live next to the open. The
  average is the one of the completed stats of the same pattern — the « average push at the open »
  KPI of the stats page (+9.6 % in the mockup), shown in the column header.
- The open is optional, like the other session data : a candidate without one simply shows no
  target price.
- Only the open is stored ; the target price is recomputed.
- Deleting a candidate deletes its row, open included. A stat already created keeps its own copy of
  the open.

**Screen** : [`candidat.html`](candidat.html) — quick entry at the top (live gap / push preview),
the day's candidates sorted by gap (with the open input and the target price), a « → Stat » button per row and a "promote them all" button,
day-by-day navigation.

---

## Step 2 — Candidate → stat ✅

- **Only through an action button** : « → Stat » on a candidate row, or "promote them all". Nothing
  is created automatically.
- The stat **takes every field of the candidate** (pattern, ticker, previous close, PM open / high,
  gap, PM push, float, volume, locate, note, open).
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
before (the morning's candidates, their open at 9:30 and the target price — cf. step 1) and after
(the stats at 4 pm, the trades in the journal). As a consequence : no real-time screen, no live
position tracking.

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

**Removed** : the pre-trade checklist, the "execution" block (front / back side, short on
resistance, exit strategy), play A / B, the risk indicators (budget, R multiple).

**Screens** : [`journal.html`](journal.html) (list + KPIs, pattern filter) and
[`trade.html`](trade.html) (the trade sheet).

---

## Step 5 — Completing the stat (close, 4 pm) ✅

**When** : after the market closes, at 4 pm.

**What I type in** (in $, share prices) :

| Data | Example | Note |
|------|---------|------|
| Open | 4.20 | Session open — the base of every percentage. **Pre-filled** with the open typed on the candidate at 9:30 |
| Push at the open | 4.62 | **New** — the price reached by the push that follows the open |
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
- The stat stays "to complete" until all five session prices are in ; the flags default to no.
- No percentage is stored : everything is recomputed from the prices.
- The KPIs on top (completed, average push at the open, average LOD, fade) cover **the whole
  filter**, not the displayed page.
- No CSV import : neither for the stats (a stat is born from a candidate) nor for the journal (a
  trade is born from a stat). Both keep a CSV **export** — premarket block, session block and flags
  on the stats side (session prices empty for a stat still to complete) ; identity, position,
  executions and the three P&L figures on the journal side.
- "Traded / not traded" filter : shipped with the link to the trade (#193).

**Screen** : [`stats.html`](stats.html) — a "complete the session" panel for the pending stats (live
percentage preview), a table with the premarket data (carried from the candidate) and the session
data, the flags, and a « → Trade » button or a link to the existing trade.

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
- **Colours** : green / red for outcomes only (P&L, amounts, gaps) ; amber for warnings (SSR, < $1,
  expensive locate, to complete) ; indigo for statuses and categories (pattern, "in stats") ; the
  rest neutral, price moves and tickers included.
- **Icons** : Material Symbols Rounded — the mapping is in `README.md`.
- **Alignment** : content aligned left (right after the menu), not centred — easier to read. A
  maximum width is kept so the lines don't stretch.
- **Dense forms** : Material fields at 40 px (density -4), and no space reserved under a field until
  there is an error to show.

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
