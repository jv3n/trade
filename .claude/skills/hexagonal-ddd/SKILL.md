---
name: hexagonal-ddd
description: Hexagonal + DDD-tactical conventions for the PortfolioAI backend. Use when wiring a new external provider, introducing a port and its adapters, adding an `@Primary` routing client, designing fail-soft error handling, or deciding what belongs in `domain/` vs `application/` vs `infrastructure/`.
---

# Hexagonal + DDD Conventions

A practical flavour of hexagonal — bounded contexts at the top, three layers inside, and opinionated patterns for talking to external providers.

Pair with [`folders-structure-backend`](../folders-structure-backend/SKILL.md) for *where* files go; this skill is about *why* the structure works.

## Glossary

Use these terms exactly. Drift into "service" / "provider" / "client" interchangeably and the architecture loses its shape.

- **Bounded context** — a top-level package under `com.portfolioai/` (`market/`, `news/`, `analyst/`, …). One product capability.
- **Domain** — pure Kotlin under `<context>/domain/`. No Spring, no Jackson, no JPA. Compilable without a Spring context. Includes aggregates, value objects, enums, and **outbound ports**. Domain exceptions live next to the aggregate that raises them; cross-context exceptions like `UpstreamUnavailableException` live in `shared/`.
- **Application service** — `@Service` under `<context>/application/` orchestrating one use case. Depends on ports + other application services. Where caching and `@Async` live.
- **Port** — `interface` declaring what a capability needs from the outside. All current ports are *outbound* and live in `<context>/domain/` — the domain owns the contract it depends on.
- **Adapter** — concrete `@Component` under `<context>/infrastructure/<capability>/`. Three flavours: **real** (`FinnhubClient`, `TwelveDataClient`), **mock** (`MockNewsClient`, deterministic synthetic data, default when no API key), **routing** (`RoutingNewsClient`, `@Primary`, delegates per-call).
- **Wire model** — Jackson-bound DTOs mirroring an external provider's JSON exactly. Lives in `<Provider>Models.kt` alongside its adapter. Never crosses into `domain/`.
- **Routing** — the `@Primary` adapter that selects which real/mock adapter to delegate to at every call, based on the runtime config key.
- **Fail-soft** — degrading a non-critical external dependency to `null` instead of failing the whole request. Distinct from **fail-hard**: required dependency, errors propagate via `UpstreamUnavailableException` → HTTP 503.

## The canonical port + adapter group

```
news/
├── domain/
│   ├── NewsItem.kt          # domain value object
│   └── NewsClient.kt        # PORT — interface, ~10 lines, KDoc what callers expect
├── application/
│   └── NewsService.kt       # imports NewsClient from domain
└── infrastructure/
    └── news/
        ├── MockNewsClient.kt        # ADAPTER — deterministic, default when no key
        ├── FinnhubClient.kt         # ADAPTER — real provider
        ├── FinnhubModels.kt         # wire DTOs (Jackson-bound)
        ├── FinnhubMappers.kt        # wire → domain (Foo.toDomain())
        └── RoutingNewsClient.kt     # @Primary, dispatches per call
```

```kotlin
@Service
class NewsService(private val client: NewsClient) {   // gets RoutingNewsClient injected (@Primary)
  @Cacheable(NEWS_CACHE, key = "#symbol.toUpperCase() + '|' + #limit")
  fun forSymbol(symbol: String, limit: Int = 10): List<NewsItem> = client.fetchNews(symbol, limit)
}
```

Naming is **verbatim across contexts** — don't rename `Client` to `Provider` or `Service` because "it reads better" in one place. The grep-ability of `Routing*Client` is the point.

**Why ports live in `domain/`** — strict hexagonal: the domain owns the contracts it depends on; infrastructure realises them. Dependencies point inward (`infrastructure/news/` *imports* `domain/NewsClient`, never the reverse). Keep the port file pure: no Spring, no Jackson, no annotations. If a "port" needs `@Component`, it's an adapter.

> Historical note (B1 refactor) — until early 2026, ports lived in `<context>/infrastructure/<capability>/`. The B1 dette pass moved them to `domain/`. JPA repository interfaces (`*Repository extends JpaRepository`) are **not** ports of the same kind and stay in `infrastructure/persistence/` — framework-tied by design.

## The routing pattern — three rules

### 1. Always instantiate every adapter

```kotlin
@Component class MockNewsClient : NewsClient { /* … */ }
@Component class FinnhubClient(/* … */) : NewsClient { /* … */ }
```

**No `@ConditionalOnProperty`.** Both beans always wired so a runtime config switch lands on the *next call*, not after reboot.

### 2. The router is `@Primary` and reads config per call

```kotlin
@Component
@Primary
class RoutingNewsClient(
  @Qualifier("mockNewsClient") private val mock: NewsClient,
  @Qualifier("finnhubClient") private val finnhub: NewsClient,
  private val appConfig: AppConfigService,
) : NewsClient {
  override fun fetchNews(symbol: String, limit: Int): List<NewsItem> {
    val provider = appConfig.getString(ConfigKeys.NEWS_PROVIDER)
    return when (provider) {
      ConfigKeys.PROVIDER_MOCK -> mock.fetchNews(symbol, limit)
      ConfigKeys.PROVIDER_FINNHUB -> finnhub.fetchNews(symbol, limit)
      else -> throw IllegalArgumentException("Unknown news provider: '$provider'")
    }
  }
}
```

Read config per call, not at construction. Caching the value once at construction defeats the design.

### 3. Delegate by `when`, not by name lookup

The `when` is explicit; unknown-provider throws `IllegalArgumentException` (→ HTTP 400). Don't build a map-by-name — every new adapter is a code change anyway, and the explicit `when` makes the supported set discoverable.

## Fail-soft vs fail-hard

Pick once per call site, document the choice.

### Fail-hard — the call is required

Wrap upstream errors in `UpstreamUnavailableException` (defined in `shared/` because the same 503 contract applies to every external integration). Let it propagate.

```kotlin
try {
  rest.get().uri("/stock/recommendation?symbol=$symbol&token=$token").retrieve().body(...)
} catch (e: HttpClientErrorException.Unauthorized, e: HttpClientErrorException.Forbidden) {
  throw UpstreamUnavailableException("auth-failed", e)
} catch (e: HttpClientErrorException.TooManyRequests) {
  throw UpstreamUnavailableException("rate-limited", e)
} catch (e: ResourceAccessException) {
  throw UpstreamUnavailableException("unreachable", e)
}
```

`GlobalExceptionHandler` maps `UpstreamUnavailableException` → HTTP 503 with body `"Données momentanément indisponibles"`. `NoSuchElementException` → 404 for "symbol not covered by the provider".

### Fail-soft — the call is optional enrichment

A secondary endpoint that may legitimately be unavailable (e.g. Finnhub's `/stock/price-target` 401s on free-tier). Catch *specifically* the expected errors, return `null` or skip the field, **log `warn`** for debugging:

```kotlin
private fun fetchPriceTargetOrNull(symbol: String, token: String): PriceTarget? = try {
  rest.get().uri("/stock/price-target?symbol=$symbol&token=$token").retrieve().body(...)
} catch (e: HttpClientErrorException) {
  log.warn("price-target unavailable for {} ({})", symbol, e.statusCode)
  null
}
```

Two rules:
1. Fail-soft is opt-in per call site, **not** a generic try/catch around the whole adapter — a bare `catch (Exception)` swallows your own bugs and disguises them as "provider unavailable".
2. Fail-soft is for **enrichment**, never for the primary capability. If the user-visible feature breaks without this call, it's fail-hard.

## Cache placement

`@Cacheable` lives on the **application service**, not on the adapter.

```kotlin
@Service
class NewsService(private val client: NewsClient) {
  @Cacheable(NEWS_CACHE, key = "#symbol.toUpperCase() + '|' + #limit")
  fun forSymbol(symbol: String, limit: Int = 10) = client.fetchNews(symbol, limit)
}
```

Three reasons:
1. **Provider switch invalidation** — the key excludes the provider name. When the user flips `news.provider`, the next call hits the router fresh. Adapter-level caching would mix stale `mock` data after switching.
2. **One cache per capability**, not one per adapter.
3. **`@Cacheable` runs through Spring AOP** — the proxy must wrap the bean at the call site. Service-level wrapping is clean.

Use `#symbol.toUpperCase()` (Java method) in SpEL, not `.uppercase()` (Kotlin extension — invisible to SpEL).

Known exception: `market/`'s historical `TwelveDataClient` caches at the adapter with a `'twelvedata|'` key prefix. Dette technique ticket tracks homogenising.

## When to introduce a port — the deletion test

*Would deleting this port concentrate complexity, or just move it?*

A port earns its keep when **two or more adapters exist** (mock + real, or two real providers). One adapter is a hypothetical seam — interface tax for a switch nobody flips. Wait for the second adapter. Two adapters almost always means mock + real here, because the mock path is what makes the app demoable without API keys. If you can't picture the mock, you don't need the port yet.

## Cross-context dependencies

Bounded contexts call each other through **application services**. Never inject another context's adapter directly; never reach into another context's `domain/` from an adapter.

- `analysis/` consumes `market/`, `news/`, `analyst/`, `earnings/` via their `*Service` beans (not `*Client` ports).
- `portfolio/` reads market quotes via `market.application.TickerService`.
- `UpstreamUnavailableException` is the one accepted shared symbol — crosses contexts intentionally because the 503 mapping must stay uniform. Lives in `shared/` so importing it doesn't create an implicit cross-context dep.

If a new cross-context dep would force importing an adapter or wire model, that's a smell — promote what you need into the consumer's application service, or move the shared concept to `shared/`.
