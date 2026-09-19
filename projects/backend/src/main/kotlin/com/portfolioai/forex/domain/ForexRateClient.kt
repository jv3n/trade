package com.portfolioai.forex.domain

/**
 * Port — fetches the latest [ForexRate] for a currency pair.
 *
 * The single adapter (`FrankfurterForexClient`) hits the keyless, ECB-backed Frankfurter API.
 * Another provider could replace it behind this port without touching callers.
 *
 * **Fails loudly** : a provider outage surfaces as
 * [com.portfolioai.shared.UpstreamUnavailableException] (→ HTTP 503), never a stale or invented
 * rate. The degradation happens on the front-end, which keeps the balance in USD rather than
 * showing a wrong CAD figure.
 */
interface ForexRateClient {
  fun latest(base: String, quote: String): ForexRate
}
