---
name: hexagonal-ddd
description: Hexagonal + DDD-tactical conventions for the PortfolioAI backend. Use when wiring a new external provider, introducing a port and its adapters, adding an `@Primary` routing client, designing fail-soft error handling, or deciding what belongs in `domain/` vs `application/` vs `infrastructure/`.
---

# Hexagonal + DDD Conventions

PortfolioAI's backend uses a **practical** flavor of hexagonal — bounded contexts at the top, three layers inside, and a small set of opinionated patterns for talking to external providers. The patterns below are not generic DDD theory ; they are the choices this project made, with their motivations.

Pair this skill with [`folders-structure-backend`](../folders-structure-backend/SKILL.md) for *where* files go ; this skill is about *why* the structure works and what rules to follow when extending it.

## Glossary

Use these terms exactly. Drift into "service", "provider", "client" interchangeably and the architecture loses its shape.

- **Bounded context** — a top-level package under `com.portfolioai/` (`market/`, `news/`, `analyst/`, …). One product capability, owned end-to-end.
- **Domain** — pure Kotlin types under `<context>/domain/`. No Spring, no Jackson, no JPA. Compilable without a Spring context. Includes aggregates, value objects, and enums. Domain exceptions live next to the aggregate that raises them ; cross-context exceptions like `UpstreamUnavailableException` live in `shared/`.
- **Application service** — `@Service` bean under `<context>/application/` orchestrating one use case. Depends on ports + other application services. Where caching and `@Async` live.
- **Port** — `interface` declaring what a capability needs from the outside. In this project, all current ports are *outbound* (the application calls them) and live in `<context>/infrastructure/<capability>/` — see "Why ports live in infrastructure" below.
- **Adapter** — concrete `@Component` implementing a port. Three flavors in this project : **real** (`FinnhubClient`, `TwelveDataClient`), **mock** (`MockNewsClient`, deterministic synthetic data, default when no API key), **routing** (`RoutingNewsClient`, `@Primary`, delegates per-call).
- **Wire model** — Jackson-bound DTOs that mirror an external provider's JSON exactly. Lives in `<Provider>Models.kt` alongside its adapter. **Never** crosses into `domain/` — `<Provider>Mappers.kt` translates wire → domain.
- **Routing** — the `@Primary` adapter that selects which real/mock adapter to delegate to *at every call*, based on the runtime config key (`market.provider`, `news.provider`, `llm.provider`, …).
- **Fail-soft** — degrading a non-critical external dependency to `null` instead of failing the whole request. Distinct from **fail-hard** : the dependency is required, errors propagate via `UpstreamUnavailableException` → HTTP 503.

## The canonical port + adapter group

A bounded context that calls one external provider ships five files under `<context>/infrastructure/<capability>/` :

```
news/infrastructure/news/
├── NewsClient.kt            # PORT — interface, ~10 lines, KDoc what callers expect
├── MockNewsClient.kt        # ADAPTER — deterministic, default when no key
├── FinnhubClient.kt         # ADAPTER — real provider
├── FinnhubModels.kt         # wire DTOs (Jackson-bound)
├── FinnhubMappers.kt        # wire → domain (Foo.toDomain())
└── RoutingNewsClient.kt     # @Primary, dispatches per call
```

The application service consuming this group is **one layer up** and depends on the port :

```kotlin
// news/application/NewsService.kt
@Service
class NewsService(private val client: NewsClient) {   // gets RoutingNewsClient injected (@Primary)
  @Cacheable(NEWS_CACHE, key = "#symbol.toUpperCase() + '|' + #limit")
  fun forSymbol(symbol: String, limit: Int = 10): List<NewsItem> = client.fetchNews(symbol, limit)
}
```

Naming is **verbatim across contexts** — don't rename `Client` to `Provider` or `Service` because "it reads better" in one place. The grep-ability of `Routing*Client` is the point.

### Why ports live in `infrastructure/`, not `domain/`

Classical hexagonal puts ports in `domain/` or `application/`. This project keeps them in `infrastructure/<capability>/` for one reason : **the concept "client to an external provider" is itself an infrastructure concern**. The domain doesn't know providers exist — it knows `NewsItem`, not `NewsClient`. The application service is the seam where the abstraction matters, and it imports the port from `infrastructure/`.

The trade-off : a future "swap Spring for ktor" would touch every port file. Acceptable — that swap is not on the roadmap, and the win in colocation (port + adapters + wire models in one folder) is real every time you read the code.

If a port emerges that is *not* about an external provider — a true domain abstraction the application depends on but doesn't want to know the implementation of — that one would belong in `application/` or `domain/`. None exist today.

## The routing pattern

Three rules, all enforced :

### 1. Always instantiate every adapter

```kotlin
@Component class MockNewsClient : NewsClient { /* … */ }
@Component class FinnhubClient(/* … */) : NewsClient { /* … */ }
```

**No `@ConditionalOnProperty`.** Both beans are always wired. A runtime config switch (`news.provider: finnhub → mock`) must land on the *next call*, not after a reboot. `@ConditionalOnProperty` evaluates once at startup and locks you in.

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

**Read config per call**, not in the constructor. The whole point is that `/settings/configuration` can flip providers without a reboot. Caching the value once at construction defeats the design.

### 3. The router delegates by `when`, not by name lookup

The `when` is explicit and the unknown-provider branch throws `IllegalArgumentException` (→ HTTP 400 via `GlobalExceptionHandler`). Don't build a map-by-name to "support arbitrary providers" — every new adapter is a code change anyway, and the explicit `when` makes the supported set discoverable.

## Fail-soft vs fail-hard

External calls fail one of two ways. Pick once per call site and document the choice.

### Fail-hard — the call is required

The endpoint can't return a sensible answer without this data. Wrap the upstream error in `UpstreamUnavailableException` (defined in `shared/` because the same 503 contract applies to every external integration — Finnhub for news/analyst/earnings, Twelve Data for market, Claude/Ollama for the LLM pipeline). Let it propagate.

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

`GlobalExceptionHandler` maps `UpstreamUnavailableException` → HTTP 503 with a `"Données momentanément indisponibles"` body. The frontend distinguishes 503 from 500 in its error banner.

`NoSuchElementException` is the other domain exception worth knowing — used when a symbol simply isn't covered by the provider. Maps to HTTP 404.

### Fail-soft — the call is optional enrichment

A secondary endpoint that may legitimately be unavailable (e.g. Finnhub's `/stock/price-target` 401s on free-tier accounts but the rest of the analyst snapshot is still useful). Catch *specifically* the expected errors, return `null` or skip the field, and **log a `warn`** so a debugging session can spot the silent degradation.

```kotlin
private fun fetchPriceTargetOrNull(symbol: String, token: String): PriceTarget? = try {
  rest.get().uri("/stock/price-target?symbol=$symbol&token=$token").retrieve().body(...)
} catch (e: HttpClientErrorException) {
  log.warn("price-target unavailable for {} ({})", symbol, e.statusCode)
  null
}
```

**Two rules :**
1. Fail-soft is opt-in per call site, not a generic try/catch around the whole adapter. A bare `catch (Exception)` swallows your own bugs (NPE, `IllegalStateException`) alongside the real network errors and disguises them as "provider unavailable".
2. Fail-soft is for **enrichment**, never for the primary capability. If the user-visible feature breaks without this call, it's fail-hard.

## Cache placement

`@Cacheable` lives on the **application service**, not on the adapter. The router doesn't see cache hits.

```kotlin
// CORRECT — caching at the use-case layer
@Service
class NewsService(private val client: NewsClient) {
  @Cacheable(NEWS_CACHE, key = "#symbol.toUpperCase() + '|' + #limit")
  fun forSymbol(symbol: String, limit: Int = 10) = client.fetchNews(symbol, limit)
}
```

Three reasons :
1. **Provider switch invalidation** — the key excludes the provider name. When the user flips `news.provider`, the next call hits the router fresh and gets the new feed. If the cache lived on each adapter, you'd get a mix of stale `mock` data after switching to `finnhub`.
2. **One cache per capability**, not one per adapter. Six adapters, six caches would be a footgun.
3. **`@Cacheable` runs through Spring AOP**, same as `@Async` — the proxy must wrap the bean that's injected at the call site. The router is `@Primary`, the service depends on the port, so the cache wraps the service cleanly.

Use `#symbol.toUpperCase()` (the Java method) in the SpEL key, not `.uppercase()` (the Kotlin extension — invisible to SpEL).

**Known exception** : `market/`'s historical `TwelveDataClient` caches at the adapter with a `'twelvedata|'` key prefix. Dette technique ticket #1 tracks homogenising it onto the service-level pattern.

## The deletion test — when to introduce a port

Borrowed framing : *would deleting this port concentrate complexity, or just move it?*

A port earns its keep when **two or more adapters exist** (mock + real, or two real providers). One adapter is a hypothetical seam — you're paying interface tax for a switch nobody flips. Wait for the second adapter before introducing the port. The translation : if `MockMarketChartClient` was added later, the port came with it. The single-adapter design before that point had `TickerService` calling `TwelveDataClient` directly, and nobody missed the abstraction.

Specifically for this project, "two adapters" almost always means mock + real, because the mock path is what makes the app demoable without API keys. If you can't picture the mock, you probably don't need the port yet.

## Cross-context dependencies

Bounded contexts call each other through **application services** (or, sparingly, by reusing a domain exception like `UpstreamUnavailableException`). Never reach into another context's `domain/` from an adapter, and never inject another context's adapter directly.

Concrete rules :

- `analysis/` consumes `market/`, `news/`, `analyst/`, `earnings/` via their `*Service` beans. It does *not* import their `*Client` ports.
- `portfolio/` reads market quotes via `market.application.TickerService`.
- `UpstreamUnavailableException` is the one accepted shared symbol — it crosses contexts intentionally because the 503 mapping must stay uniform regardless of who threw it. It lives in `shared/` (not in any single context's `domain/`) precisely so importing it from `news/`, `analyst/`, `earnings/`, `market/`, `analysis/` doesn't create an implicit cross-context dependency.

If a new cross-context dep would force you to import an adapter or a wire model, that's a smell. Promote what you actually need into the consumer's application service, or move the shared concept to `shared/`.

## When NOT to introduce a port

- **You have one adapter and no concrete plan for a second.** Inline the call. Add the port when the second adapter materialises.
- **The "port" is a wrapper around one Spring repository method.** `OrderRepository.findById` is already an interface in Spring Data ; wrapping it in `OrderLookupPort` adds a layer with no extra leverage.
- **You're tempted by a port to "make it testable".** Application service tests should mock the existing port (`MockMarketChartClient`-style) ; if a piece of logic needs unit-testing in isolation, extract a pure function in `domain/` or `application/` instead.
- **The dependency is internal to one bounded context.** A port between `TickerNarrativeRunner` and `TickerNarrativeParser` would be pointless ; they live and ship together.

## When NOT to fail-soft

- **The primary user-visible feature breaks without this data.** Fail-hard, throw `UpstreamUnavailableException`, let the UI surface 503.
- **The error you're swallowing is a programming bug** (NPE, `IllegalStateException` from your own code, `JsonProcessingException` on a wire model you control). Catch the specific HTTP / network exceptions and let the rest propagate.
- **You can't write a one-line `log.warn` that explains *why* the degradation is safe.** If you can't justify the silent fallback, it isn't safe.
