package com.portfolioai.forex.domain

/**
 * Port — fetches the latest [ForexRate] for a currency pair.
 *
 * The single live adapter (`FrankfurterForexClient`) hits the keyless, ECB-backed Frankfurter API.
 * A paid real-time provider could be slotted behind this port (+ a routing adapter, as the
 * `market/` module does) without touching callers.
 *
 * **Fail-soft** : a provider outage surfaces as
 * [com.portfolioai.shared.UpstreamUnavailableException] (→ HTTP 503), never a stale or invented
 * rate — the front-end then keeps the balance in USD rather than showing a wrong CAD figure.
 */
interface ForexRateClient {
  fun latest(base: String, quote: String): ForexRate
}
