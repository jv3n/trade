# TradeZero fees — what a short costs beyond the P&L

> A GUS short pays up to five things besides the price move : the **locate**, the **commission** of a
> marketable order, the **regulatory fees** on the sell, the **overnight borrow** if held past the
> close, and the fixed **platform / account** costs. Only the locate is known before the trade.

*Last revised : 2026-09-26, from TradeZero's published fee schedule (TradeZero International) and
support pages. To check against a real statement — see the last section.*

---

## The fees

| Fee | When it is charged | How much | Known in advance ? |
|---|---|---|---|
| **Locate** | When the locate quote is **accepted** — before the short, whether it is used or not | A price **per share**, variable through the day (supply / demand) ; $0.01–0.08 on the usual GUS | Yes — the quote |
| **Commission** | On each **paid** order (short and cover each count) | $0.005 / share, $0.49 minimum ; sub-$1 : $7.95 max up to 250,000 shares | Roughly |
| **Regulatory** (SEC, FINRA TAF, CAT) | On the **sell** side — the short entry of a GUS | A few cents per trade, passed through | No — tiny |
| **Overnight borrow** | Only when the short is **still open after the close** | Annualised rate × position value, per night ; odd lots rounded up to 100 shares ; Thursday counts 3 nights | No — rate set at T+1, known at T+2 |
| **Platform / data** | Monthly | ZeroPro $59 (waived past 100K shares a month or a $30K account) ; OTC Level 1 / 2 $8 / $20 | Yes |
| **Account** | On the event | Wire out $15, reverse split $35, broker-assisted trade $30, margin interest 9 % | Yes |

### Which orders are free

**Non-marketable limit orders** on NYSE / NASDAQ / AMEX stocks **above $1** : no commission, short
included. Everything else pays the per-share rate : market orders, **marketable limits** (the short
hitting the bid on a fade), anything **under $1**, OTC. A GUS entry into a fading premarket is often
marketable — count the commission.

### The locate, in detail

- **Standard** : lets you short and cover the same ticker several times in the day.
- **Single-use** : one short + one cover per session, cheaper, served first on threshold securities.
  Credited back only if **no share** of it was ever shorted.
- **Pre-borrow** : required on Reg SHO threshold securities, dearer, the one to hold overnight.
- **Unused locates** can be listed back : if another trader takes them, part of the fee comes back.
- Accounts over $30K / $100K get 7.5 % / 10 % off locate prices.
- A locate is paid **per share located, not per share shorted** : locating 2,000 and shorting 1,000
  still costs 2,000 × the price. And a locate paid on a stock never shorted is a pure loss.

---

## What it means for the tracker

- The **locate / price** ratio of the candidates and stats is the right pre-trade gauge : it is the
  only fee known before entering, and on a $2 stock a $0.08 locate is already 4 % of the price.
- The **real P&L** typed on a trade comes from the statement and absorbs what the broker books on
  the trade itself (commissions, regulatory fees). The locate is charged at acceptance, apart from
  the fills — **most likely not in the trade's P&L**, so today it only reaches the account through
  a reconciliation correction.
- Overnight borrow does not concern the GUS (flat by the close), but would a held short.

## Still to verify

On a real TradeZero statement :

1. Is the locate a **separate cash line** (and under which label), or folded into the trade ?
2. Are commissions and regulatory fees inside the trade's realised P&L, or separate lines too ?
3. Does a locate credit-back show up as its own line ?

The answers decide how the account records them — a typed « fee » movement, or nothing more than
today's adjusted P&L.
