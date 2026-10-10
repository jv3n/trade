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

### Name and sign-in

The app is **Ticker Story** (#457), served on `tickerstory.org`. Its mark stays the monoline **P**
with its three small ticker lines, on a rounded tile — dark in the light theme, white in the dark
one : kept on purpose, even though it no longer matches the name. Only what the user
sees carries the name : the code's identifiers (`com.portfolioai`, `@portfolioai/ui`, the cloud
resources) stay as they are.

Out of session, the **sign-in page** says what the app does — candidates and stats, the journal, the
account — and offers « Se connecter avec Google ». Screen : [`connexion.html`](connexion.html).

### Pattern

The **stat** and the **trade** carry a **pattern** — **chosen when the candidate is promoted**,
inherited by the trade. **A candidate has no pattern** (#428) : it is the ticker of the day and its
premarket, not yet assigned to a setup — the same ticker can give a GUS in the morning and a double
top late in the morning. **A stat is a GUS or a DT** (#648) — the only two patterns traded and
measured. **A trade keeps all five** : a SIR, SIV or discretionary trade is typed in the journal, on
its own, with no stat (#634) :

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
  DT stat, each with its own trades if taken. A stat of another pattern can also be **born from an
  existing one** (#507) : same day, same ticker, the day's prices carried over.
- **Several trades per stat** (#500) : I take the same name more than once in a day, short or long,
  and **I say where a trade ends** — each one is created by hand (« + Trade »), with its own
  direction, executions, P&L, post-mortem, screenshot and account line.
- **A trade usually comes from a stat, and can stand alone** (#628). A trade exists the moment
  money moved at the broker ; the stat is how the setup was studied, and some trades have no study
  — an import, a session typed after the fact, a trade taken on impulse. Forcing a stat on them
  would invent measurements in the one place every statistic is computed from.

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

**The morning opens on yesterday's stats** (#531) : the app is only opened in the morning, so the
stats of a session are completed the next day, before anything else. The steps read : 1 complete
yesterday's stats · 2 reconciliation · 3 candidates · (shares located, optional — #625) · 4 session ·
5 the day's trades. The trades stay on the day : they are entered once the trading is over, sometimes at
10 am, not the next morning.

**The morning reconciliation happens right inside step 2** : app balance, typed TradeZero balance,
live gap, and a button to validate (or to create the correction when there is a gap). No need to
open the account page in the morning. Most mornings TradeZero shows the app's own balance : an
**« Aucun écart »** button next to it reconciles at the computed balance in one click, nothing to
type, no confirmation (a clean morning creates no correction) (#407).

**Each step's title, text and action describe the same job** (#337) :

- **Capture the candidates** (step 3) is done once **every** captured candidate is in the stats
  sheet — has at least one stat, whatever its pattern (#428) — capturing one is not enough. It
  carries the « Promote the N left » action : promotion is morning work, before the session the
  stats are filled during.
- **Locate the shares** (#625, a key in place of a number) lists the day's locates, one ticker per row (shares added
  up), each opening its locates to top up or fix, and « Louer » types a new one. It is **optional** :
  a locate is a cost recorded when it happens, not something owed every day. Ticked once a locate
  is in, it is **never the current step** and does not count in « n étapes faites sur 5 » ; with no
  candidate, or once New York has closed with nothing located, it reads « Rien de loué
  aujourd'hui ».
- **Complete yesterday's stats** (step 1, #531) counts the stats still to complete **before
  today** — the day's own are not in it : they cannot be completed before their session, and they
  are tomorrow morning's. **Yesterday** — the previous trading day, so Friday on a Monday — is the
  normal case ; anything older is overdue and listed in amber (« Overdue : GLND (21/09), KTTA
  (17/09) ») until it is ticked (#337). Its single action opens the stats sheet, where the session
  panel opens on the first stat to complete. The step is **done when nothing is left before
  today** — a morning with nothing to finish is simply done, whatever the day's candidates.

**A quiet day can be done too** (#407). Some days nothing on the radar is worth a candidate, and
many days end without a trade : « nothing today » is an answer, not a step left undone.

- **« Aucun candidat aujourd'hui »** on step 3, while the day has no candidate : step 3 reads
  « nothing today ». It says nothing of the stats step, which looks at the days before today.
- **« Pas de trade aujourd'hui »** on step 5, while the day has no trade : step 5 reads « nothing
  today ». Independent of the first — a day with stats and no trade is the common case.
- **« Aucun écart »** on step 2, for the morning TradeZero shows the app's balance : a real, clean
  reconciliation at the computed balance — step 2 is done (green check), not « nothing today ».
  Same block on the account page. Undone with the reconciliation's own « Annuler ».
- One click, no confirmation (nothing is created or deleted), and **« Annuler »** next to the state.
  Capturing a candidate or entering a trade afterwards overrides the mark : the data wins. The
  step keeps its « Saisir » / « Choisir une stat » link, so a day that turns out busy needs no undo.
- The mark is **stored as declared**, never cleared by the data : deleting the only candidate or
  trade of the day brings the « nothing today » state back, at the time of the original mark. On
  purpose — the declaration was true, and the record of the quiet days stays what the user said.
- The state is **neutral**, a grey dash in the dot — a status, not an outcome, so never green. A
  step in that state counts as done in « n étapes faites sur 5 » (the optional locates step aside).
- The mark is **stored per day** (backend), so it survives a reload or another device, and the quiet
  days stay on record for the stats later. Today only, for now.

**Screen** : [`aujourdhui.html`](aujourdhui.html). The mockup has an « 8h00 / 16h15 / Jour calme »
toggle to see the page at two moments of the day, and on a day with nothing to do.

---

## Locates (#602, #625)

A locate is paid **before** the trade, and **whether or not the trade happens** — on TradeZero per
share located, not per share shorted. It is a **cost**, not a property of the stock : nothing about
shares located belongs next to gap, float or push, which measure the setup — this one eats the net.
So it is typed on the day, where money and execution live, and reaches the account as an expense,
never as a trade.

- **Where it is typed** : the **« Louer les actions »** step of **Today**, after the candidates ;
  the **« Locate »** button of the **Account** page ; and the **trade sheet**, which lists the
  locates of its day and ticker and lets them be topped up or fixed — the page open when the
  figures are checked against the broker statement. **Not on Candidates nor Stats** : those sheets
  measure, they do not spend.
- **A locate is a (day, ticker)** : I type the day, the ticker, the **shares located** and the price
  per share ; the **cost = shares × price**. Nothing links it to a candidate or a trade — it is
  matched to the day's trades by ticker, so a locate typed before the trade exists still shows on
  it.
- **The share's price when the locate is bought** is kept with it, for one rule : **a locate stays
  under 2 % of the share's price**. Its **weight = price per share ÷ share price** (0,05 $ on a
  2,40 $ share = 2,08 %) shows live while typing, in the dialog's « % du prix » column and next to
  each locate on the trade sheet, always with two decimals ; **at 2 % or more it reads amber** — a
  warning on the discipline. The day's **blended weight** on a ticker, cost ÷ (shares × share
  price) across top-ups at different prices, sits on the dialog's total row and next to the trade
  sheet's total : it answers « was this ticker under 2 % today ».
- **The share's price starts from the day's PM open** of the candidate on that ticker (the stat's
  on the trade sheet), a top-up from the last share price typed — matched by (day, ticker), never a
  link — and stays correctable. It is optional : a locate typed without it has no weight.
- **No quote on the candidate nor the stat** : the locate has nothing to do with the setup, only
  with the account — the former « Locate » field of the capture and of the stat is gone, with its
  locate / price ratio. The price is typed on the locate ; a top-up starts from the last price
  paid on that ticker that day.
- **Several locates per ticker and per day** (a top-up, often at another price) : Today's step
  shows one row per ticker with their total shares, and the day's total. The locates of a (day,
  ticker) open in one dialog : each row **corrected in place** (shares, price — an edit, no
  confirmation) or deleted, their total of shares and cost, and the form that adds one.
- A locate is **never cancelled** by the app : once taken it is spent. Deleting one is fixing a
  typo — its account line goes with it.
- **A locate listed back** on TradeZero (unused, taken by another trader) refunds part of its
  cost : that refund is an ordinary **adjustment** on the account — typed by hand, or caught by the
  next morning's reconciliation. The locate itself keeps what was paid : its shares were paid for.

**Screens** : [`aujourdhui.html`](aujourdhui.html) (step 4), [`compte.html`](compte.html)
(« Locate » and the lines), [`trade.html`](trade.html) (the day's locates of the trade).

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
| Note | « Résistance 4,65 » | Free text, optional |

**What the app computes** (nothing to type) :

- **Gap %** = (PM open − previous close) ÷ previous close → +52.8 % here.
- **Push %** = (PM high − PM open) ÷ PM open → +14.8 % here.

**Decided** :

- No checkboxes for the qualitative GUS criteria (chart, company, reverse split).
- Nothing about sizing (capital, risk, stop, entry scale, fills, covers) : none of it is known at
  capture time.
- One candidate per day and per ticker : a second entry for the same ticker on the same day is
  refused.
- **No pattern at capture** (#428) : the pattern is chosen when promoting (step 2).
- **A ticker spotted for a DT is captured when it forms**, usually late in the morning, with the
  **same premarket** as the morning ones (previous close, PM open / high, float, volume) — so
  the DT KPIs can be compared with the GUS ones. A ticker already captured that morning is not
  captured again : its DT is a second stat (step 2).
- Previous close, PM open and PM high are mandatory (PM high ≥ PM open) ; float, volume and note
  are optional.
- No locate here (#625) : it is a cost, recorded on its own — see « Locates » above.
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
  push, float, volume, note, open) — not the target push, which is a plan — and **the pattern
  of the button** used. A **DT** takes no premarket (#649) : only float, volume, note and the open
  (its start).
- A candidate promoted before 9:30 has no open yet : the open typed on it afterwards also fills its
  stat, as long as the stat's open is still empty.
- The stat is created "to complete" : the session data arrives at step 5.

**Decided** :

- **The pattern is chosen here** (#428) : « → GUS » in the morning, « → DT » when the double top
  forms — both a creation, so both confirm. A candidate already promoted shows one badge per stat
  (« ✓ GUS », « ✓ DT ») and the button of each pattern it has is gone : it cannot be promoted twice
  in the same pattern (refused). Each badge is a link : it opens the stats page on that stat, its
  panel already open (#383) — right after promoting is when you want to go and fill it.
- The two stats of a candidate take the same float and volume — the GUS also its premarket — then
  live their own lives.
- Only GUS and DT have a button — they are the only patterns of a stat (#648).
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

- **Usually through the « → Trade » action button** on a stat row.
- **A trade without a stat** (#628) : « + Trade » on the journal, with a date, a ticker, a pattern
  (GUS by default) and a direction ; it opens the new trade's sheet. It counts in the journal and the
  account like any other, never in the stats sheet, and is never « out of pattern » — nothing was
  measured. Its sheet keeps its executions, P&L, locates, post-mortem and screenshot ; only the
  day's context (premarket, open, HOD, LOD) is missing, and the sheet says so.
- **Deleting a stat keeps its trades** (#628) : the confirmation warns when a trade is attached, and
  the trade stays in the journal without a stat — executions, P&L, account line and pattern
  untouched. It is how the stats invented for an import go away without taking the trades along.
- **Several trades per stat** (#500) : the button stays on the stat once it has a trade (« + Trade »)
  and creates the next one, empty — same date, ticker and pattern. Each trade has its **own
  direction** : one stat can hold a short and a long.
  A double top on the same day goes through another stat, born from this one (« Same ticker, another
  pattern », #507) ; a trade under a pattern a stat does not measure (a discretionary long on the
  bounce) is typed in the journal, with no stat (#648).
- The trade **inherits the stat's pattern** and shows its context (premarket + session), read-only.

**What I type in on the trade** :

| Block | Content |
|-------|---------|
| Executions | Time, kind (entry / exit), share count, price — one row per TradeZero fill |
| Post-mortem | "What happened" + "Mistake / to improve" |
| Chart screenshot | One image (PNG / JPEG / WebP, 5 MB max) |

**What the app computes** : the **max position** (the most shares held at once — not the sum of the
entries : a scale-in, a partial cover and a re-add count the peak), average entry / exit (and their
distance to the open), P&L in $ and %, duration of the trade (first entry → last exit), and an
**« after 11 am »** tag in the sheet's header when the first entry fill is at 11:00 or later (#647) —
nothing to tick, the fill's time says it.

**No automatic split** (#500) : the app never decides where a trade ends. An exit followed by a
re-entry and an add after the stock pushes higher are the same sequence of fills to it, and « back to
flat » stops meaning anything once a long and a short can be taken on the same ticker in a day. So the
executions saved on a trade stay on it, whatever they do — a second trade is one I create. What a
trade contains is my call, and so is what its duration covers.

**The trades of a stat** : the trade sheet lists them in its header (number and retained P&L, the
total beside, the current one outlined) ; the stats row shows one P&L tag per trade ; deleting a trade
leaves the others, the stat and their account lines — the balance moves by that trade's retained P&L
alone. The numbering is positional, recomputed when a trade goes : not an identity.

**Adjustable P&L** : the P&L is computed from the executions, but I can type in the **real P&L** of
the TradeZero statement to absorb the broker's fees and rounding (a few cents to a few dollars — I
don't know the exact fees in advance). The app shows the computed one, the real one and the gap. The
**retained P&L** (the real one if typed, else the computed one) is what reaches the account.
The real P&L can only be typed **once the position is closed** : on an open or partial position the
field is greyed out, since no exit backs the amount yet.

**The day's locates** (#609, #625) : the day context lists the locates of the trade's day and
ticker (« 2 000 × 0,04 (1,7 %) + 500 × 0,06 (2,5 %) = 110,00 $ US · 2 500 actions » — each one's
weight against the share's price when typed, and the shares to weigh against the position), and its key opens them to **top up or fix** — a top-up starting from the last price
paid. They stay **outside the trade's P&L** : each one has its own
account line, or it would be counted twice.

**Saving** : the trade sheet is edited as a whole and saved with the « Save » bar that shows up as
soon as something changed. Leaving the page with changes not saved asks first (« Leave without
saving? ») — a nav click, the back button, closing or reloading the tab — so a debrief is never lost
silently.

**Removed** : the pre-trade checklist, the "execution" block (front / back side, short on
resistance, exit strategy), play A / B, the risk indicators (budget, R multiple).

**The journal lists one row per ticker and per day** (#500) : the trades of a day on one name — of
one stat or of two (a GUS and a DT, #507) — are one row, carrying a chip per pattern and per
direction, the number of trades, the **max position** (the largest of the day's trades — never a
netted or summed exposure : a short of 350 and a long of 200 add up to nothing real), the day's P&L
and the **cumulated duration** (the sum of the trades' durations — not time in the market, since a
trade may now contain a flat stretch). Average entry, average exit and P&L % stay : filled on a
single-trade row and on each trade of an opened row, blank on a row carrying several. A single-trade
row opens its sheet, as before ; a row with several opens onto its trades, each a link to its sheet.
Sorting, filtering and paging count rows, not trades ; the **CSV export stays one line per trade** —
it is a dump the import reads back.

**Late entries, across the journal** (#651) : the question behind the « after 11 am » tag is not
« was this trade late » but « do my late entries lose money », so the journal answers it on the
whole set, with **one definition** — the earliest timed entry fill, at 11:00 or later, the sheet's :

- a row carries the tag as soon as one of its trades is late ; opened, each trade carries its own ;
- an **« Entry »** filter in the toolbar — all / before 11 am / after 11 am ;
- a KPI card comparing the two : win rate and average P&L, after 11 am versus before.

A trade with no timed entry fill is on **neither side** — its entry time is not known. No CSV column
for now.

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
| Institutions > 20 % | yes / no | More than 20 % of the float held by institutions, read on the broker screen — ticked by hand (#349, #369) |

**What the app computes** : push at the open %, HOD %, LOD %, EOD %, all **vs the open** — e.g. push
at the open (4.62 − 4.20) ÷ 4.20 = +10.0 % ; and from the premarket, the **hold** and the two
**cumulative** readings of the scanner (#499, below).

**Institutional ownership** came back as a flag (#349) — « Institutions > 20 % », ticked by hand
like the other two (#369 fixed a label that read the other way round). Low ownership is a GUS entry
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
- The KPIs on top (completed, median push at the open, median LOD, fade, median hold) cover **the whole
  filter**, not the displayed page.
- No CSV import : neither for the stats (a stat is born from a candidate, or typed by hand) nor for
  the journal (a trade is typed, from its stat or on its own). Both keep a CSV **export** — premarket block, session block and flags
  on the stats side (session prices empty for a stat still to complete) ; identity, position,
  executions and the three P&L figures on the journal side.
- "Traded / not traded" filter : shipped with the link to the trade (#193).

**Editing the premarket, and a stat from scratch** (#326) :

- The premarket is a **card of its own**, above the session one and built the same way : the
  **pattern**, previous close, PM open, PM high, float, volume, note, **editable** and saved
  field by field, gap and PM push shown live under their fields. Copied from the candidate at
  promotion, it can be fixed on the stat ; the stat keeps its own copy, the candidate is left alone.
  **A DT has no premarket** (#649) : a double top is read off the session, not off the morning, so
  its card keeps float, volume and note only (titled « Titre » rather than « Premarket »).
- **The pattern is not changed after the fact** (#648) : a stat is a GUS or a DT, and a double top
  has prices of its own — a GUS that turns into a double top is a second stat, not a re-filing
  (#428). The re-filing among the patterns measured like a GUS (#393) went with SIR, SIV and
  discretionary.
- **« Same ticker, another pattern »** (#507) : at the head of the premarket card, a stat gives birth
  to the other one — a GUS to its DT, a DT to its GUS — same day, same ticker, shown only while the
  other is free (one stat per pattern, as ever ; #648 leaves two). **The day's prices are carried over** (previous close, premarket, open, the push at the
  open or « no push », HOD / LOD / EOD — a DT sibling keeps none of the premarket, #649) : they belong to the day, not to the setup, so a GUS sibling is
  completable as born and two stats of one day never disagree about what the stock did (#517) ; what is specific to the pattern starts empty. A double top keeps none of the
  session : it starts from the open and types its own four prices. It is an
  ordinary stat from there : its own check, its own trades, its own line in its pattern's
  statistics. This is how the GUS of the morning and the DT of late morning both get recorded : a trade
  always takes its stat's pattern, so a different setup is a different stat. Asks for confirmation (it creates something).
- **« New stat »** opens the two cards empty, with the **date** (any day up to today, never a future
  one), the pattern and the ticker on top : going through the charts, I find a ticker that matched
  my pattern a few days ago and never made it to my candidates — leaving it out would bias the stats
  towards the days I happened to be watching.
- **« Create the stat »** asks for confirmation (it creates something) and needs the date, the
  ticker and the three premarket prices — a DT only the date and the ticker (#649). Picking DT swaps the session card for the double top one.
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
- The **median push at the open** only counts the stats that pushed, so the 0 % days don't drag it
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

### Measuring the GUS with the numbers it is decided on (#499)

**Two gaps under one name.** The app's **gap** is previous close → premarket open ; the TradeZero
scanner, on which the `gap ≥ 45 %` criterion of `docs/pattern/GUS.md` is read, measures **previous
close → the price right now** (CAPR, measured live : 36.8 % on the scanner, 16.6 % for the app's
gap). Both stay — the gap / PM push split says whether the move happened while the market was shut
or is being bid in real time, which for a short seller is the thesis. What was missing is the
**cumulative** figure, the one the 45 % rule speaks :

- **cumulative at the PM high** = previous close → PM high, the highest the scanner showed that
  morning — shown under the gap ;
- **cumulative at the open** = previous close → open (9:30), what it still showed at the bell —
  shown under the open.

**Hold** = PM high → open, `(open − pmHigh) / pmHigh` : what survives of the premarket at 9:30. Its
own column, in the session group. « It pushes at the premarket open, settles until 9:30 ; if it
collapses before, I don't take it » — LXEH lost half before the bell with nothing on screen to say so.
No threshold yet : the « median hold » card will tell where the line sits.

Gap, PM push and hold **compose** into the cumulative at the open — in log they add exactly — but
everything is shown in percent, the unit the scanner, the broker and the tracker speak. Nothing is
stored : all three are recomputed from the prices, like the session percentages.

**Medians, not means** on the GUS cards and the table's footer row : one or two big movers dragged « average LOD » by up to 7
points. The DT already reads a median duration ; its leg averages stay for now.

**Out of pattern** — a computed amber flag, never ticked by hand, carrying only what the recorded
prices verify **at the moment of the entry** :

- a DT whose retest is at or above the top — a breakout, not a double top ;
- a price outside the pattern sheet's range (the open, for a GUS : ~$0.30 – $10) ;
- the hold, once a threshold exists.

**Never the gap** : on the app's gap BKYI would have been flagged on 24.9 % when the scanner showed
113 %. A stat flagged out of pattern **stays in the statistics** — the failures are the denominator,
and « fade 8 / 10 » must not become 8 / 8. What it splits is the P&L : the journal shows the P&L of
the trades taken on out-of-pattern stats in a card of its own, beside the in-rules one — a
discipline number, never read as a strategy number. The flag shows in the flags column, and an
**« Out of pattern »** toggle isolates those stats.

**A checkbox survives only if the app cannot derive it.** « Price < $1 » goes : a box restating a
price, wrong on a third of the stats. It becomes a « < $1 » tag derived from the open and an
**« Under $1 »** toggle — known **once the open is typed** : in premarket a stat whose PM prices
sit under a dollar carries no tag yet, on purpose (the margin floor bites on the price traded, and
the PM prices are not it ; the box could be ticked early, but was wrong a third of the time). Both toggles sit beside the status tabs, not among them : they combine with
any tab (the out-of-pattern stats among the completed ones, the traded ones…) and with each other. « Entry after 11 am » leaves the stat
too (#647), box and tag, on a GUS as on a DT : it is about the trade, not the setup — the trade sheet
derives it from its first entry fill.
SSR, institutions > 20 % and no push stay : nothing else recorded says them.

### The double top stat (#428)

A DT is measured by what makes it (`docs/pattern/DT.md`), not by the GUS session : it carries **no
premarket** (#649) — the card above keeps float, volume and note — and the « Session » card becomes a **« Double top »** card of four points — a
**time and a price** each (#469) — saved field by field like the rest. The card reads **one row per
point**, like an execution in the journal : point, time, price, then the leg it closes.

| Point | Time | Price | Note |
|-------|------|-------|------|
| Start | 10:02 | 1.90 | Where the push starts — **pre-filled with the open**, moved when it starts from a later low |
| Top | 10:14 | 2.95 | The top of the first push |
| Rejection low | 10:21 | 2.36 | The low of the rejection |
| Retest | 10:38 | 2.85 | The high of the retest, back toward the top |

The times are wall-clock on the stat's day, to the minute. They go **in order** — start ≤ top ≤ low ≤
retest — and a time that goes back is refused, the field at fault pointed out like a bad price : a DT
whose low precedes its top is a typo.

**What the app computes** — the three legs :

- **A, the extension** = start → top (+55.3 %). Amber under **50 %**. The « with the gap » reading
  (from the previous close) went with the premarket (#649) : every leg is measured inside the session.
- **B, the rejection** = top → rejection low (−20.0 %). Amber under **17 %** : a normal breath, not a
  rejection.
- **C, the retest** = rejection low → retest (+20.8 %), and its **distance to the top** (−3.4 %, or
  « top taken back ») — a DT often grazes its top without taking it.

- **Each leg also has a duration** (#469) : A start → top, B top → low (how fast the rejection comes
  — the one the entry depends on), C low → retest, and the **total** start → retest. The question
  behind it : does a double top really play out over about half an hour ?
- The stat is checked with the **four prices and the four times** (« n / 4 prices · n / 4 times ») ;
  same check, same rules.
- The flags stay (SSR, institutions > 20 %) ; « no push » does not apply.
- **The page follows the pattern** : a **GUS / DT / All** switch above the KPIs picks the KPIs, the
  table's columns and the averages (#648 — the SIR, SIV and discretionary views stayed empty). Each
  pattern has its own numbers, never folded into the other's. **DT** : completed DT stats, average extension, average rejection (and how many reach 17 %), average retest distance to the top (and how
  many took it back), and the **median duration** start → retest with its `n` and the median
  rejection (B) — a median, not a mean : one DT that drags all afternoon would move an average and
  say nothing about the typical one. The table shows float and volume, then start, A, B, C and the
  duration (total, and the three legs under it) ; its footer carries the median. **All** keeps what
  compares across patterns — premarket (blank on a DT), float, volume, flags, check, trade — plus a one-line summary of each stat
  in its own pattern, and no averages, neither in the cards nor in a row : a push at the open and a
  DT extension don't add up, and the summary computes none without a pattern.
- The « À l'open » push references only use GUS stats, as before (same pattern).
- **Data model** — the four DT prices are nullable columns on the stat rather than a table of their
  own, so the database CHECK can keep a ticked stat whole, pattern by pattern (#435).

**Screen** : [`stats.html`](stats.html) — a « Premarket » card and a « Session » card for the stat
being filled (live percentage preview, fields saved one by one with the save state next to each
title, "n / 5 prices" — 4 with « No push » — and the check button), a « New stat » button, a table
with the premarket data, the session data (partial for the stats in progress),
the flags, the check column, and a « → Trade » button or one P&L tag per trade, each a link to it,
with « + » for the next one. The
« SGBX · GUS / SGBX · DT » switch shows the two panels of one candidate's two stats, the pattern
switch the six views of the page.

---

## Tool — Calculators

The **small calculations** a trader redoes by hand — in a phone calculator or out loud — needed
*while* looking at something else : typing a candidate, reading a stat, watching TradeZero. So they
are not a page (#421 removed it) but **floating widgets**, called from anywhere.

- **A launcher in the top bar**, on every page, next to the account : a menu of the four
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
- **A scratchpad, front only** : the figures typed are not saved. They survive a widget closed and
  opened again, or a trip to another page ; **a reload leaves no figure** — no widget open, no price
  kept (#388). It works on any ticker, including one that is not in the candidates.
- **Two exceptions (#496)** :
  - **the account balance is read** : it prefills the « Solde » field of the two sizing calculators —
    one field shared by both, editable, back to the account's figure after a reload ;
  - **the settings are remembered** in the browser, from one visit to the next : the stop preset, the
    ceiling in % of the balance, and the **broker rules** (leverage, margin floor per share, lot,
    safety margin). They are choices, not figures of a trade — retyping them every morning would be
    the error.

**The four calculators** — the short P&L and the average after a scale-in were dropped (#496) : the
journal computes both from the executions, with real fills and fees, and keeps them.

**The broker's margin rule shapes both sizing calculators (#496).** TradeZero does not size a short
against its value : under a threshold it charges a **flat amount per share** — 1 000 shares shorted
at $1.50 take $5 000 of margin, not $1 500. So the margin of a share is `max(price, floor)`, the
buying power is `balance × leverage`, and **under the floor the share count stops depending on the
price** : with $20 000 of buying power and a $2.50 floor the cap is 8 000 shares at $0.39, $0.65 and
$1.30 alike. A size that respects the risk but not the margin is one the platform refuses.

- **« Règles du broker »**, a folded section at the foot of both sizing calculators, its summary line
  giving the values in use (« levier 2 · 2,50 $/act. · lot 100 · sécurité 5 % »). Unfolded :
  **leverage** (default 2), **margin floor per share** (default $2.50, `0` for a margin in % of value
  with no floor), **lot** (default 100, the max size only) and a **safety margin** (default 5 %) that
  keeps the size just under the wall — a floor moved overnight must not turn it into a rejection.
  One set shared by both calculators, remembered. Under the fields, the link to the **TradeZero
  margin note** with its « vérifiée le » date.
- **The note** is `docs/notes/tradezero-margin.md` (and its French twin), shown with the other notes
  on the Patterns page : the three published schedules (US, International, Canada), clickable
  sources opening in a new tab (the note is read while sizing, leaving the app would lose the place), the values the calculators use by default next to them, and the open question — which
  schedule this account is on. It documents, it does not lock : the values stay editable in the
  calculators.

1. **Percent move** : from / to → signed percent (`3,23 → 2,70 = −16,4 %`), and the inverse, a price
   and a percent → the resulting price.
2. **Max size** (#496) — *how many can I short without being refused* : the largest size the broker
   will accept on this stock, right now, to place the order once. The balance, the **share price**,
   an optional **ceiling in % of the balance** (any value, 40, 80… ; empty, it caps nothing) and an
   optional **locate cost per share**, plus the broker rules. The sums :
   `byMargin = balance × leverage × (1 − safety) ÷ max(price, floor)`,
   `byCeiling = balance × ceiling ÷ price`, `shares = ⌊min(byMargin, byCeiling) ÷ lot⌋ × lot` —
   rounded **down** to the lot, rounding up is how the order comes back refused. The outputs :
   - **the max in shares**, big, first — the number typed into the ticket ;
   - **one line naming the cap that bound** : « Limité par la marge : 3 663 actions à 2,50 $/action »
     or « Limité par ton plafond de 80 % du solde » ;
   - the position's value and **the % of the balance it really is** — on a cheap stock the margin
     rule makes it much smaller than expected ;
   - the margin it takes and the buying power left, to judge a second position ;
   - the **locate cost**, in $ and in % of the position, and the reminder that locates are paid
     whether the trade is taken or not.
3. **Position size** (short), **keyed off the open** like the rest of the app : the balance, the risk
   in **% of the balance** (its value in $ spelled out as a result), the open, and the stop in **%
   above the open** — two presets, `+40 %` and `+31 %` (the tracker's), the stop price shown next to
   them. The output is a **ladder of entry levels** (+5, +7, +10, +15, +20, +25, +30 % over the open,
   the ones at or above the stop left out) : for each, the price, the share count **rounded down**
   (`risk ÷ (stop − entry)`, copied in one click), the capital engaged and **the margin it needs**
   (`shares × max(price, floor)`). A row the usable buying power cannot cover is **amber**, with a
   line saying the order would be refused — never shown as if it were available. A current price,
   optional, highlights the nearest level — none under the open, and at or past the stop an amber
   line says the trade is invalidated instead of pointing at a row. A stop under the first level says so rather than an
   empty ladder.
4. **Distance and R:R** : current price, stop, target → the distance to each in % and in $ per share,
   and the ratio, labelled in full « Risque : Gain (R:R) » (`1 : 2,4`) with its reading under it —
   « Tu risques 1 pour gagner 2,4 ». The stop reads from the price and the stop alone — the target is
   often decided later. A stop under the price or a target above it is an amber error, each its own.

- **Results update as you type**, no « Compute » button. An incomplete card shows `—`, never `0`.
- **Short labels, the unit inside the field** (#408) : « Solde » with `$ US` as a suffix,
  « Variation » with `%`, « facultatif » as the placeholder of an optional field. A percent **of
  something** shows `%` inside the field **and** names its base in the label — « Risque (% du
  solde) », « Plafond (% du solde) », « Stop (% / open) » : a bare `%` would not say which, and a longer
  suffix leaves no room for the number.
- **Both decimal separators** are accepted : the numeric keypad gives `.`, the French layout `,`.
- **Formats of the rest of the app** : percentages to one decimal, prices at the price precision (2
  decimals from $1, 4 below — #311), amounts with `$ US`, share counts grouped.
- **Each result copies in one click, as a bare number** ready to paste into the broker, a
  spreadsheet or a field of the app : no grouping, no currency, a dot for the decimals (`1234.50`,
  #406). For a distance, the $ per share.

**Later** : prefilling from a candidate or a stat (open, price…) ; for the GUS
fade, which often has no target, a « hit rate needed to break even » from the stop alone.

**Screen** : the launcher and the widgets on [`candidat.html`](candidat.html) — each drags by its
header, the menu opens the others.

---

## Tool — Notes (#521)

While the session runs : somewhere to drop a thought and a few tickers to keep an eye on, without
leaving the page. Not a journal entry, not a stat — **a scrap of paper that lives for the day**.

- **A « Notes » button in the top bar**, next to « Calculatrices » : a menu with **« Nouveau
  post-it »**, then every post-it of the day (named by its first line, « Post-it n » while empty)
  and the watchlist, each **toggled on its own** and marked « ouvert » while it is.
  - **Post-its, as many as wanted** — each a free-text window with its own colour and place. What
    is typed is kept. « Fermer » keeps a post-it in the menu with its text — one never written in
    carries nothing, so it goes ; **« Supprimer »** removes it — confirmed only when it holds text.
  - **Tickers à surveiller** — a list : a ticker typed then Enter adds it, a click on its chip removes
    it. Uppercased and trimmed like everywhere else ; a ticker already in the list is not added twice.
- Both are **small floating windows**, dragged by their header and kept inside the window, under the
  top bar ; closing one and opening it again loses nothing.
- **« Détacher »**, like the calculators : the window moves into its own always-on-top window
  (Document Picture-in-Picture), so the notes stay in view over TradeZero during the session ;
  closing that window puts it back in the page. Absent where the browser lacks the API.
- **A colour per window** — green, blue, yellow or red — the colour **of the window itself**, like a
  real post-it. Nothing hangs off it : not a status, not a filter (so the colour rule of the
  interface does not apply).
- **Kept in the browser** (`localStorage`, like the calculators' settings) : per window the content,
  the colour, the position and whether it is open — per post-it too. No endpoint, no table : unlike the theme and the
  language, which follow the user from one machine to the next, these notes die tonight. **Known
  limit, accepted** : they live in one browser — opened on the other machine, they are not there.
- **Emptied on a new day** : the store carries the date it was written on. On another day — at the
  first load, or at the first keystroke of a tab left open past midnight — an **open** post-it
  **ever written in** comes back **empty** in place (a « règles du jour » kept red in its corner
  stays there through a quiet morning), every other one goes (closed, or never written in), and the
  watchlist is emptied ; each window kept keeps its colour, its position and its open state.
- **A window always comes back in reach** : a position dropped on a big screen is brought back
  inside a smaller one, and the windows follow a resize — the header stays grabbable. The day is the **local** date : premarket starts at 04:00 and the session
  ends at 20:00, midnight never cuts a session in two.
- Dropping a window is a position write, not a save : nothing to confirm.
- **On a phone** a floating window is a nuisance : under the phone width the windows dock as a
  full-width panel, and dragging is off.

**Screen** : the « Notes » button and the two windows on [`candidat.html`](candidat.html).

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
  « → Trade », « + Trade » on the journal (its dialog is the confirmation), deleting a candidate, a
  stat or a trade. The modal says what is about to happen (what is
  carried over, what disappears — e.g. the account movement when a trade is deleted). Deletions get
  a red button. No modal for editing, and none for data entry.
- **The morning entry** : validated as is (inline form + live gap / push preview).
- **The stats table** : every column stays, horizontal scrolling is not a problem.
- **Colours** : green / red for outcomes (P&L, amounts, gaps) — plus one status, the green check of
  a completed stat ; amber for warnings (SSR, < $1, to complete, locates paid for nothing) ;
  indigo for statuses and categories (pattern, "in stats") ; the rest neutral, price moves and
  tickers included.
- **Icons** : Material Symbols Rounded — the mapping is in `README.md`.
- **On a phone** (#456) : **viewable, not a mobile app** — enough to open a screen and read it on
  the move ; the morning capture and the completion panel stay desktop work, and a cross-platform
  app is the plan later. Under 900 px the menu leaves the page : a top bar carries a menu button,
  the menu opens as a drawer over the page and closes on a choice. Wide tables scroll inside their
  card, never the page. Screens : [`mobile.html`](mobile.html).
- **Alignment** : content aligned left (right after the menu), not centred — easier to read. A
  maximum width is kept so the lines don't stretch.
- **Period filter** (stats, journal, account) : one shared control — presets from « today » to
  « last year », « all time », and « custom range », which reveals a from / to date picker. It
  filters the listing and the KPIs alike.
- **Loading** (#539) : a page's **first load** shows a **skeleton** shaped like what is coming —
  the real table header over ghost rows that follow its columns (numbers right-aligned, tickers as
  chip-shaped blocks), the KPI row, a card's title and lines, Today's steps — never a spinner then a
  jump. **Neutral only**, a slow shimmer ; under reduced motion a still fill, no shimmer, no fade.
  It appears after **~180 ms** (a fast answer never flashes it), stays **at least ~300 ms** once
  shown, and the content replaces it with a **150 ms fade**. A **refetch** (filter, page, sort) keeps
  the content in place and dims it, as today. **Inline spinners stay for actions** (saving,
  uploading, exporting) : they say « working on your click », not « the page is loading ». Today
  shows no step as « to do » before all its data is in. Screen : [`chargement.html`](chargement.html).
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
    day). Every stats KPI — the push, the LOD, the fade — is measured on those, over the
    **filtered set**, never the displayed page. The card shows the total beside the count, so
    « completed » can't be mistaken for « all of them ».
  - a **counted trade** is one carrying a **retained P&L** (closed, or with a broker P&L typed on
    it). An open position has none, so the journal's KPI card counts the closed trades — and says
    « closed trades » — while its table lists ticker-days, several trades to a row (#500).
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
| Locate | **Automatic** — every locate shows up as an expense, − shares × price (#602) ; typed from Today, the trade sheet or « Locate », deleted from its line, never edited as a movement |
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

**A reconciled morning stays true** (#474, #476) : on morning D the broker's balance already
counted every movement dated before D. So adding, fixing or deleting a movement dated `d` is
absorbed by **the first reconciled morning after `d`** — its correction moves by the opposite
amount, and the balance does not move. With no reconciled morning after it (today's trades, cash
arrived since), the balance moves by exactly the change. A clean morning gains a correction when it
absorbs one ; a correction absorbed down to zero disappears and its morning reads clean.

**An absorbed correction says so** (#477) : in the movements table, a correction whose amount no
longer matches what its morning measured carries an indigo **« ajustée »** tag (a status, not a
warning — the gap was explained, not wrong) and, next to it, **« mesurée −15,40 $ US »** — the gap
that morning recorded. A morning's correction with no note is labelled **« Rapprochement du 12/09 »**
rather than a dash. The tag's tooltip says why : an earlier row was fixed since and absorbed there, so
that morning's balance is still TradeZero's. A correction that was never adjusted looks as before.
A morning's correction is not editable (#476) — it changes by reconciling that morning again ; it
can be deleted, which takes its morning with it.

**A typed balance is checked before it rewrites the account** (#307) : a **negative** balance is
refused on the field (the broker never shows one) and the button stays disabled ; a gap **above
20 % of the computed balance** still goes through, but its confirmation says so and reads as a
warning — at that size it is a typo far more often than a real drift.

**Reconciliation gaps** (#338) : a KPI tile sums the period's corrections — what the broker took
outside the trades : locates, the platform subscription, rounding, a mistyped P&L. Measured **by
difference**, it catches every fee whatever its name, and no broker rule lives in the code (the
schedule is in [`docs/notes/tradezero-fees.md`](../docs/notes/tradezero-fees.md)).

- **Value** : the amount, without its sign (« 12,40 $ ») ; **sub-line** : its share of the period's
  P&L (« 1,6 % du P&L »). Neutral colour — the label carries the direction.
- **Not labelled « frais »** : the gap also carries rounding and a wrong P&L. It is an indicator, not
  an accounting figure.
- **Follows the dates, ignores the type filter** : under « Trades », « Dépôts / retraits » or
  « Corrections » the ratio would read a plausible 0 % or divide by zero.
- **Reads the mornings, not the corrections** (#480) : the figure is the sum of the gaps the
  period's reconciled mornings recorded. A correction can absorb a later fix to an older row (#476)
  and then holds more than what the broker took ; a recorded gap never moves, so the same period
  reads the same tomorrow. The window is the mornings dated in the period — a morning measures the
  day before it, a one-day shift accepted so the tile agrees with the movements table. With no
  reconciled morning in the period the tile is hidden : nothing was measured, and a 0 would lie.
- A **losing or flat period** shows the amount and a dash for the ratio. A period whose corrections
  come out **net positive** (a credited-back locate) shows « +5,00 $ » and « crédit net » instead of
  a percentage.
- The balance tile takes **one column** instead of two, so the four tiles hold on one row.

**The movements table opens on « Trades »** (#473, #629) — what the page is opened for : with a
real month loaded the locates outnumber the trades, so they keep their own « Locates » filter and
the « Locates » tile keeps them in sight. A locate typed from the page's « Locate » button switches
the filter to « Locates » when the active one would hide it, so what was just typed is on screen ;
« Tous les types » is one click away, and the period keeps its own default (« Ce mois »). Corrections are hidden by default, so the gap tile
above is what keeps them in sight. A filter that matches nothing says so — « Aucun mouvement pour
ce filtre » with a button back to « Tous les types » — rather than the empty account's « ajoute
un dépôt ».

**Locates** (#602, #625) : a **« Locate »** button types a locate — date, ticker, shares, price per
share, the share's price (optional), the cost and the weight shown live. Each locate is its own line, like a trade's : labelled with its ticker
and shares, never edited as a movement — its delete button deletes the locate itself. The
**retained P&L of a trade stays gross of locates** — the locate is never inside it, or it would be
counted twice. A fifth KPI tile, **« Locates » of the period**, shows underneath
the part **paid for nothing** — on a ticker with no trade that day, today's counted once **New York
has closed** (16:00, the market clock of the Today page) — in amber : what the discipline costs. It
is an **upper bound** : a locate listed back and partly refunded still counts in full, its refund
being an adjustment.

**A figure on the page is current or visibly absent** (#493) : the page loads in three calls — the
period's figures (the KPI tiles), the balance curve, the movements. When one fails, what it feeds
shows **« — »** and **« Indisponible »** in place of its value — the tiles (the gap tile is left out :
whether the period had a reconciled morning is not known), « Courbe indisponible », « Mouvements
indisponibles » — never the figure of the previous render. **The morning reconciliation waits for
the balance** : with the period's figures missing, « Solde app » reads « — » and both buttons are
disabled — a gap measured against a stale balance would write a wrong correction. One red banner above says that part of
the account could not be loaded ; it stays while any call is still failing and goes once all of
them loaded again. Its **« Réessayer »** button reruns the failed calls only. No automatic retry :
a failing backend is not hammered, and the user decides when to try again.

**Screen** : [`compte.html`](compte.html) — USD / CAD balance, the morning reconciliation panel
(live gap), the history of the last reconciliations, the balance curve, the movements list ; a
mockup-only switch shows the page with its calls failing.

---

## Implementation

The recode is broken down into GitHub issues **#184 to #205** (pattern enum, confirmation modal,
candidates, stats, journal, account, Today page, navigation, settings, icons, colours…). Each issue
describes its scope, its acceptance criteria, the reference mockups and its dependencies.
Implementation decisions : the pattern is an **enum** in the code, and the **database restarts
empty** (no data migration).
