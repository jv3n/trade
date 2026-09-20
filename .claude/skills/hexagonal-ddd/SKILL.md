---
name: hexagonal-ddd
description: Hexagonal + DDD-tactical conventions for the PortfolioAI backend. Use when introducing a port and its adapter, calling an external API, designing upstream error handling (fail-hard vs fail-soft), wiring a cross-context dependency through a domain event, or deciding what belongs in `domain/` vs `application/` vs `infrastructure/`.
---

# Hexagonal + DDD Conventions

A practical flavour of hexagonal — bounded contexts at the top, three layers inside, a port only where the outside world is involved.

Pair with [`folders-structure-backend`](../folders-structure-backend/SKILL.md) for *where* files go; this skill is about *why* the structure works.

## Glossary

Use these terms exactly.

- **Bounded context** — a top-level package under `com.portfolioai/` (`journal/`, `account/`, `stats/`, `candidates/`, `lexicon/`, `forex/`, plus the support contexts `auth/`, `config/`). One product capability.
- **Domain** — Kotlin under `<context>/domain/`: aggregates, value objects, enums, domain calculators (`TradePositionCalculator`) and **outbound ports**. No Spring, no Jackson. JPA `@Entity` is tolerated on plain aggregates (`TradeEntry`, `AccountMovement`) — see `folders-structure-backend`. Cross-context exceptions like `UpstreamUnavailableException` live in `shared/`.
- **Application service** — `@Service` under `<context>/application/` orchestrating one use case (`TradeEntryService`, `AccountService`, `ForexService`). Owns transactions, default sorts, event publishing.
- **Port** — an `interface` declaring what a capability needs from the outside. Outbound, lives in `<context>/domain/` — the domain owns the contract it depends on. Today there is exactly one: `forex.domain.ForexRateClient`.
- **Adapter** — the concrete `@Component` realising a port, under `<context>/infrastructure/…` (`FrankfurterForexClient`).
- **Wire model** — the Jackson-bound DTO mirroring the provider's JSON (`FrankfurterLatestResponse`, `private` in the adapter file). Never crosses into `domain/`.
- **Fail-hard / fail-soft** — see below.

## The canonical port + adapter group

```
forex/
├── domain/
│   ├── ForexRate.kt                  # value object — 1 base = rate quote, asOf
│   └── ForexRateClient.kt            # PORT — pure interface, KDoc on what callers expect
├── application/
│   ├── ForexService.kt               # depends on ForexRateClient, never on the adapter
│   └── dto/ForexRateDto.kt
└── infrastructure/http/
    ├── ForexController.kt            # GET /api/forex/rate
    ├── ForexHttpConfig.kt            # @Bean forexRestClient (timeouts)
    └── FrankfurterForexClient.kt     # ADAPTER + private wire model
```

```kotlin
// domain/ForexRateClient.kt
interface ForexRateClient {
  fun latest(base: String, quote: String): ForexRate
}

// application/ForexService.kt
@Service
class ForexService(private val client: ForexRateClient) {
  fun latest(base: String, quote: String): ForexRateDto {
    val rate = client.latest(base.uppercase(), quote.uppercase())
    return ForexRateDto(base = rate.base, quote = rate.quote, rate = rate.rate, asOf = rate.asOf)
  }
}
```

Naming: port `<Capability>Client`, adapter `<Provider><Capability>Client`. Keep `Client` — don't rename it `Provider` / `Gateway` in one place.

**Why ports live in `domain/`** — dependencies point inward: `infrastructure/http/FrankfurterForexClient` imports `domain/ForexRateClient`, never the reverse. Keep the port file pure: no Spring, no annotations. If a "port" needs `@Component`, it's an adapter.

JPA repositories (`*Repository : JpaRepository`) are **not** ports of this kind: they stay in `infrastructure/persistence/`, framework-tied by design, and application services inject them directly.

## When to introduce a port — the deletion test

*Would deleting this port concentrate complexity, or just move it?*

Introduce a port for an **external system** (a third-party HTTP API): the domain shouldn't know about URLs, JSON shapes or HTTP errors, and tests can target the adapter in isolation. `ForexRateClient` passes because it hides Frankfurter's wire format and failure modes, and a different rate provider could replace the adapter without touching `ForexService`.

Don't introduce one for in-process collaborators (another `@Service`, a CSV encoder, a JPA repository) — that's interface tax for a seam nobody swaps. One adapter per port is the norm here: no router, no mock adapter, no provider switch. If a second provider is ever needed, add it then.

## Fail-hard vs fail-soft

Pick once per call site, document the choice in KDoc.

### Fail-hard — the call is required

Translate every upstream failure into `UpstreamUnavailableException` (`shared/`), and let it propagate. `GlobalExceptionHandler` maps it to **HTTP 503** (`{"error": …, "detail": ex.message}`); `NoSuchElementException` maps to 404. This is what `FrankfurterForexClient` does:

```kotlin
try {
  rest.get().uri("$baseUrl/latest?base={base}&symbols={quote}", base, quote).retrieve()
    .body(FrankfurterLatestResponse::class.java)
} catch (e: HttpClientErrorException) {
  throw UpstreamUnavailableException("client error ${e.statusCode}", e)
} catch (e: HttpServerErrorException) {
  throw UpstreamUnavailableException("upstream ${e.statusCode}", e)
} catch (e: ResourceAccessException) {
  throw UpstreamUnavailableException("unreachable", e)
} ?: throw UpstreamUnavailableException("Frankfurter returned an empty body for $base->$quote")
```

Never return a stale or invented value to mask the outage — for forex, a wrong CAD figure is worse than none. The **degradation happens at the consumer**: the front-end keeps the balance in USD on a 503. (The forex KDoc calls this "fail-soft" from the page's point of view; on the backend it is fail-hard.)

### Fail-soft — the call is optional enrichment

When a secondary call enriches an otherwise complete response, catch the *specific* expected exception, log `warn`, and return `null` / skip the field. Two rules:

1. Opt-in per call site, never a blanket `catch (e: Exception)` around the adapter — that swallows your own bugs as "provider unavailable".
2. Enrichment only. If the user-visible feature breaks without the call, it's fail-hard.

No call site in the codebase currently needs fail-soft.

## Caching an external call

`FrankfurterForexClient` caches in the adapter with a standalone Caffeine cache (6 h TTL, key `"$base|$quote"`) — not the shared `CacheManager`. Failures throw out of the loader so nothing is cached and the next call retries. Rule of thumb: cache where the upstream cost is, never cache an error, and key on normalised inputs (`ForexService` upper-cases the codes before calling the port).

## Cross-context dependencies

Contexts talk through **application-layer types** — services or events — never through another context's adapter or wire model.

- **Domain events for write-side side effects.** `journal` publishes `journal.application.TradeChangedEvent` from `TradeEntryService` (create / update / import / delete) via `ApplicationEventPublisher`; `account` consumes it with `account.infrastructure.TradeMovementSyncListener` (`@EventListener`, synchronous, **same transaction**) which delegates to the `@Transactional` `AccountTradeSyncService`. Trade and ledger movement commit or roll back together, and `journal` doesn't know `account` exists. Prefer this over injecting the consumer's service into the producer.
- **`auth/` is the shared identity context.** Other contexts inject `AuthService` (current user) and reference `auth.domain.User` on their aggregates. Known exception: `AccountTradeSyncService` injects `auth.infrastructure.persistence.UserRepository` — don't copy that; go through `AuthService` in new code.
- **`shared/`** holds the few symbols every context may import: `GlobalExceptionHandler`, `UpstreamUnavailableException`, `SpaFallbackConfig`.

If a new cross-context dependency would force importing an adapter or wire model, that's a smell — publish an event, expose what you need through the owning application service, or move the shared concept to `shared/`.

## Comments — the strict minimum

See [`CLAUDE.md > Comments`](../../CLAUDE.md#comments--the-strict-minimum). A port's KDoc is the one
place worth a few lines: it is the contract adapters and tests are written against — what the caller
may assume, and what happens when the upstream is down (cf. [Fail-hard vs
fail-soft](#fail-hard-vs-fail-soft)).
