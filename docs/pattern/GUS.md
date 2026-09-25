# Gap Up Short — pattern sheet

> **Short** a US small-cap that gapped up in premarket with no fundamental behind it. The bet : the
> price falls back during the session because the pump is artificial.

*Last revised : 2026-09-25, from the Trading Desk session of 14 September, « Les Patterns ».*

---

## Entry checklist

Every criterion has to hold **at the same time**. One KO → no trade.

| # | Criterion | Value | Why |
|---|-----------|-------|-----|
| 1 | **Price** | ~$0.30 – $10 | The zone of extreme volatility, where the pumps play. The broker allowed shorts from $1, then $0.50, now $0.30 ; under $1, buying power is the practical limit. |
| 2 | **Gap up** | ≥ +45 % | Premarket open (4:00 am) vs the previous close. Below that it is noise ; above it is a real disconnect waiting to be corrected. |
| 3 | **Float** | ≥ 1.5M | Under it, it squeezes. The floor moved 3M → 2M → 1.5M as the stats were re-run. |
| 4 | **Daily chart** | Flat or downtrend | The pump becomes a spike inside a downtrend → mean reversion. The one criterion that takes judgement — its own section below. |
| 5 | **Company** | Weak | No revenue, no catalyst → nothing to hold the price up. |
| 6 | **Premarket volume** | Present but moderate | Too little and nobody is playing. Too much and the squeeze is real, which is dangerous. |
| 7 | **Institutions** | < 20 % | Heavy institutional ownership supports the price → the ticker never becomes a candidate. |
| 8 | **No reverse split** | — | The classic trap → its own section below. |

The thresholds move with the statistics : they are re-run every few months, and the sheet follows
them, not the other way round.

---

## The daily chart — where the judgement sits

Every other line is black and white. The daily is where a ticker that meets every number still gets
refused, or one that misses a little still gets taken. What it has to show : the gap puts the price
**outside its normal range** — an extension to short, ideally into a level the market remembers.

Two cases from the session, worth keeping as the reference points :

- **NCT** — gap up of ~70 %, every numeric criterion met. But the stock had fallen off a cliff five
  days earlier and had been sitting down there since : the « gap » only brought it back inside its
  range of the past weeks. No extension to short → **disqualified as a GUS**. (It still traded, as a
  V pattern — a different setup.)
- **BMGL** — a clean daily : downtrend, not at that price since July, resistances around 8.40 and
  9.40. **Qualified on the chart.** But a 0.7M float, and a halt level sitting right on the entry :
  **refused on the risk**. It was taken later, as a penny break (see
  [`penny-break.md`](penny-break.md)).

Screenshots help more than any rule : the intraday **and** the daily of every candidate, taken or not,
reviewed weekly. The brain learns what a « not ideal but it worked » daily looks like.

---

## The statistics — why this one is learnt first

- **Win rate ~75-80 %**, measured over nine years.
- **Risk / reward usually ~1 : 1** — risking 15-20 % to take 15-20 %. Sometimes 25-30 %, rarely 50 %.

The profitability comes from the **win rate**, not the R / R. That is why approximate entries still
work on this setup, and why it is the one to master before any other : a newcomer who is a little
sloppy on entries and exits can still be profitable on it.

**The rule that follows** : the better the setup, the less picky you have to be. A clean GUS pushing
into a risk level (premarket, VWAP, daily) is worth taking **frontside**, without waiting for a
confirmation — statistically it finishes red for the day. A setup that is missing something (NCT,
BMGL) is where you wait for a sign of weakness instead.

---

## Two ways to take it

Both are valid ; plenty of traders mix them.

| | Probability | Discretionary |
|---|---|---|
| **Entry** | A limit 3 / 5 / 10 % above the open, from the stats sheet's push averages | At a risk level (premarket resistance, VWAP, daily), on a rejection, a [double top](DT.md) or a [penny break](penny-break.md) |
| **Stop** | 15-20 % — it needs breathing room, it is based on averages | 3-5 %, glued to the risk level |
| **Size** | Smaller, to pay for the wide stop | Bigger, for the same money at risk |
| **For** | More entries, fewer human errors — trade it like a robot and accept the result | Better R / R, more percentage when it pushes 20 % |
| **Against** | Gives back the edge when it pushes past the entry | Misses the trades that push 5 % and dump without a confirmation |

On a probability entry, the stop still deserves a look around : see
[`stop-rule.md`](../notes/stop-rule.md).

After 11:00 am, a trade that is in trouble is rarely worth letting run.

---

## Patterns inside the pattern

A GUS can hold a **double top** or a **penny break** — not the classic ones, smaller : a 5-15 % push,
a 5-15 % rejection, a retest. Those are the « unicorn » trades : the win rate of the GUS, with the
risk / reward of a tight discretionary entry. See [`execution-signals.md`](../notes/execution-signals.md) and
[`penny-break.md`](penny-break.md).

---

## The reverse-split trap

When a company trades **under $1 for too long**, Nasdaq / NYSE threaten to delist it. To avoid that,
the company groups its shares → the price rises mechanically, with no real move behind it.

**Example** — a 1-for-10 reverse split on a $0.50 stock :

- Before : 1000 shares at $0.50 = $500
- After : 100 shares at $5 = $500 (same value)

The stock shows up among the gainers as a `×10` gap up although **no value moved at all**. Short it
and the "gap" has no reason to close → loss.

**How to spot it** : SEC filings, or a jump in price with no matching volume on the historical chart.
