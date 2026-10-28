# Double Top — pattern sheet

> **Short** a stock that ran hard intraday, got rejected, and comes back to test its high. The bet :
> the second test fails, because the rejection convinced the market the top is in.

*Last revised : 2026-10-27 (the Sink is the low of the first fall ; what the scanner proposes, #776) ; 2026-10-13 (the points named BARES, #716) ; 2026-10-12 (the measured drop, #706) ; 2026-09-25, from the Trading Desk session of 14 September, « Les Patterns ».*

---

## The points — BARES

Five points, the same words in French and English, named after what they are :

| | Point | What it is |
|---|-------|------------|
| **B** | **Base** | The low the push starts from — the open by default |
| **A** | **Apex** | The top of the first push |
| **R** | **Rejection** | The low of the rejection off the Apex |
| **E** | **Echo** | The second test, echoing the Apex — the trade |
| **S** | **Sink** | The low of the first fall after the Echo — what the pattern paid. Not the day's low : after a bounce the price can go lower (ZTG 16/10 : 0.75, then 0.58). The fall ends at the first clear bounce off its low — **10 %** as the scanner reads it ; with no such bounce, the lowest print to the close. |

The legs are named by the point they reach : **A** the extension (Base → Apex), **R** the rejection
(Apex → Rejection), **E** the echo (Rejection → Echo), **S** the sink, the first fall (Echo → Sink). **Sink** is
also the last point of the GUS (Open · Push · Sink) : the final fall has one name in every pattern.

---

## Entry checklist

| # | Criterion | Value | Why |
|---|-----------|-------|-----|
| 1 | **Extension (A)** | ≥ +50 % | Base → Apex, intraday, from the open. With the gap counted in, it is a judgement call — the stats sheet splits « extension from the open » and « extension with a gap » for that reason. |
| 2 | **Rejection (R)** | 17-20 % off the Apex | Below that it is a normal breath (next section). |
| 3 | **Echo (E)** | Back toward the Apex | The second test is the trade. It often grazes the Apex without taking it. |
| 4 | **A risk elsewhere** | Daily or premarket level near the Apex | Not required, but it definitely helps the case. |

---

## Why 17-20 % and not 10 %

A 10 % pullback is a **normal breath** : stocks do it all the time, then go for the next level.
Example from the session — BMGL topped at 8.36 ; 8.36 + 10 % = 9.19 ; the stock turned at 9.22. Once
you know it, you see 10 % breaths everywhere, and a 10 % rejection proves nothing.

At **17-20 %**, people start believing the top is in. The longs who missed their exit, and the ones
now losing money, decide to sell the next time it comes back — that belief is what creates the
selling on the Echo (see the [four sellers](../notes/four-sellers.md)).

---

## What the scanner proposes

[`ts-scanner`](https://github.com/jv3n/ts-scanner) reads the previous session on 1-min bars and
proposes double tops to review on the stats page. Its bands are **its own, not the entry
checklist** : loose on purpose, since a false positive costs one « Rejeter » while a false negative
is never seen. Each leg is a target ± an acceptance, within its time :

| Leg | Band | Time |
|-----|------|------|
| **A** — Base → Apex | 40–200 % | ≤ 60 min |
| **R** — off the Apex | 15–32 % | ≤ 30 min |
| **E** — Rejection → Echo | 15–40 % | ≤ 60 min |

The Echo may clear the Apex by up to **6 %** — the fake-out of the last top ; past that, it broke
out and there is no double top. The session only, the Base included : no double top is taken in the
extended hours.

---

## Entry and exit

**Probability** — enter at **−5 % from the top** : a top at $3.00 → entry at $2.85. Give it ~10 % of
breathing room above the top → stop around $3.30 → risking ~15 % to take 10-15 %. A good R / R with
a good win rate, as long as the double top meets the criteria above.

The 10-15 % comes from experience. The stats page now measures it (#706) : the **drop after the
retest**, read from this −5 % entry, and how many drops reached 10 % — once a few months are in,
this line should quote the measured figure.

**Waiting for the break** of the initial high gives more confirmation of how it reacts, and better
entries — but misses a lot : a double top often **grazes the initial high without taking it**.
Entering a few percent under the high is the usual compromise.

A variant from the group : enter on the fake-out of the last top, stop ~6 % above it.

When the Echo never reaches the Apex, a bounce level that breaks and fails can still give the entry
— a [penny break](penny-break.md).

---

## The stop

The stop computed above deserves a look around before it is placed — the rule every pattern shares,
the [stop rule](../notes/stop-rule.md).
