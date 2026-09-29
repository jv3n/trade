# TradeZero short margin — why an order comes back refused

> On a low-priced stock TradeZero does not charge margin on the position's value : it charges a
> **flat amount per share**. Under that floor, the number of shares a short can take **stops
> depending on the price** — and the cheaper the stock, the less of the account can be put to work.

*Last revised : 2026-09-29, from TradeZero's published margin pages (US, International) and the
TradeZero Canada quick guide of 28 July 2026. Margin rules « may change daily and overnight due to
volatility, low float and insider holdings » (TradeZero) — check the sources below when a size looks
off.*

---

## The rule

The margin a short share takes is **`max(price, floor)`**, not its price. TradeZero's own example :
1 000 shares shorted at $1.50 → **$5 000** of margin, not $1 500.

So the cap on a short is `buying power ÷ max(price, floor)`, with `buying power = balance ×
leverage`. With $20 000 of buying power and a $2.50 floor, the cap is **8 000 shares** at $0.39, at
$0.65 and at $1.30 alike — only the notional moves. That is the « sometimes I can't take what I
want », and it bites hardest where the GUS lives : sub-$1 names.

## The published schedules

| Entity | Short margin under the threshold | Sources |
|---|---|---|
| **TradeZero US** | **$5.00 per share** under $5.00 (since 2 August 2024 ; before, $2.50 per share under $2.50 and 100 % of value from $2.51 to $4.99) | [blog](https://tradezero.com/en-us/blog/short-margin-requirements-for-low-priced-stock) · [support](https://tradezero.com/en-us/support/questions/what-is-the-margin-requirement-when-shorting-a-stock-under-usd5-00-are-these-stocks-marginable) |
| **TradeZero International** | **$2.50 per share** under $2.50 ; $5.00 per share or 6:1 from $2.50 to $5.00 ; 6:1 above. Long : 1x under $2.00, 6x above. No more than 2:1 into the 4 pm close | [margin requirements](https://tradezero.com/support/questions/what-are-your-margin-requirements-tradezero-international) · [shorting under $1](https://tradezero.com/blog/new-to-tradezero-international-shorting-stocks-under-usd1) |
| **TradeZero Canada** | Up to 3:1 intraday ; $500 of equity to short ; nothing shortable under $0.30 ; under $2.00 no margin value, cash only ; sold out at 20 % equity or $99 — **the per-share short schedule is not published** | [Quick Guide CA, 28 July 2026](https://portal.tradezero.com/manuals/tzc/Quick_Guide_TradeZero_CA.pdf) |

## What the calculators use

The two sizing calculators (« Taille maximale », « Taille de position ») model this rule. Their
**defaults**, editable under « Règles du broker » and remembered once changed :

| Setting | Default | Against the schedules above |
|---|---|---|
| Leverage | **2** | International goes to 6:1 above $2.50, Canada to 3:1 intraday ; 2:1 into the close |
| Margin floor per share | **$2.50** | International ; US is $5.00 ; Canada unpublished |
| Lot | **100** shares | Locates sold by the hundred |
| Safety margin | **5 %** of the buying power | Keeps the size under the wall if the floor moved overnight |

If a published figure changes, update the table above **and** these defaults in the same change.

## Still to settle

**Which schedule this account is on.** The Canadian guide does not publish the per-share short
table, and $5.00 against $2.50 a share is half the position. To settle it :

1. ask TradeZero support which short margin applies under $2.50 / $5.00 on this account ;
2. or read the buying power the platform reserves on a real order ticket before sending it — divide
   it by the share count to get the floor in use.

Until then the default floor is $2.50 — the calculators are a model of the broker's rule, not the
rule itself.
