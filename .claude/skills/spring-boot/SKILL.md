---
name: spring-boot
description: Spring Boot conventions for the PortfolioAI backend (Kotlin + Spring Boot 3.x). Use when adding a controller, service, configuration class, `@Async` method, cache, event listener, transactional boundary, profile-specific bean, or integration test. Skips general Spring tutorial content.
---

# Spring Boot Conventions

Project-specific Spring choices. This skill is for the calls the project makes when Spring offers two reasonable options, plus the AOP / proxy gotchas that bite enough to be worth pinning verbatim.

Pair with [`kotlin-idioms`](../kotlin-idioms/SKILL.md) for the Kotlin-side rules (constructor injection, `require`, SpEL `.toUpperCase()`) and [`hexagonal-ddd`](../hexagonal-ddd/SKILL.md) for ports/adapters and fail-soft.

## Stereotypes

- **`@Service`** — application-layer beans orchestrating one use case. Under `<context>/application/`. Where `@Cacheable`, `@Async`, `@Transactional` live.
- **`@Component`** — everything else Spring-managed : adapters, listeners (`OrphanedJobCleanupListener`, `CacheTtlListener`), routing clients, repository helpers. Under `<context>/infrastructure/` mostly.
- **`@Configuration`** — bean factories (`@Bean` methods). Three exist : `MarketConfig` (Caffeine cache manager, lives at the root of `market/` not under `infrastructure/` because the cache spec is shared across the whole bounded context), `TwelveDataHttpConfig`, `FinnhubHttpConfig` (each declares one `@Bean` `RestClient` with auth + timeouts).
- **`@RestController`** — under `<context>/infrastructure/http/`. One controller per endpoint group, depends on application services only.
- **`@RestControllerAdvice`** — exactly one in the codebase (`shared/GlobalExceptionHandler`). Don't add a second ; map new domain exceptions there.

No `@Repository` — Spring Data JPA interfaces extending `JpaRepository<T, ID>` are the only flavour, and they don't need the annotation.

## The AOP proxy rule — `@Async`, `@Cacheable`, `@Transactional` self-calls

All three annotations are implemented as Spring AOP proxies. The proxy wraps the bean at injection time ; **calling the method via `this.foo()` from inside the same bean bypasses the proxy and runs synchronously / uncached / non-transactional**. This is the single most common Spring footgun in the codebase.

### `@Async` — separate bean

```kotlin
// CORRECT — @Async on a dedicated bean
@Component
class TickerNarrativeRunner(private val executor: TickerNarrativeExecutor, /* … */) {
  @Async
  fun run(symbol: String, jobId: UUID) {
    val snapshot = executor.execute(symbol, jobId)
    /* … */
  }
}

// WRONG — would silently run synchronously
@Service
class TickerNarrativeService(/* … */) {
  fun create(symbol: String): TickerNarrativeJob {
    val job = jobStore.create(symbol)
    runAsync(symbol, job.id)        // ❌ self-call, no proxy, no async
    return job
  }
  @Async fun runAsync(symbol: String, jobId: UUID) { /* … */ }
}
```

The runner is a thin wrapper around the executor for one reason : to be a *different bean* so the `@Async` proxy applies. Same shape for any future async work — never `@Async` and the caller in the same class.

### `@Cacheable` — split into two beans, never self-inject

If a method needs to call its own `@Cacheable` peer, the proxy bypass applies the same way. The fix is **always to split into two beans** — `@Cacheable` lives on the cache-holding bean, the consumer that needs the cached value is a separate `@Component` that depends on it. The pattern in `SymbolValidator` :

```kotlin
@Service
class SymbolSearchService(private val client: SymbolSearchClient) {
  @Cacheable(SYMBOL_SEARCH_CACHE, key = "#query.lowercase() + '|' + #limit")
  fun search(query: String, limit: Int): List<SymbolMatch> = client.fetch(query, limit)
}

@Component
class SymbolValidator(private val search: SymbolSearchService) {
  fun exists(symbol: String): Boolean =
    search.search(symbol, 10).any { it.symbol.equals(symbol, ignoreCase = true) }  // ✅ proxy
}
```

Spring injects the cached service via the proxy by construction — no `@Lazy self` hack, no nullable backing field for tests, no "watch out for the self-call" rule for future readers. The split makes the dependency explicit and the cache boundary visible.

The earlier `@Lazy self` pattern (inject the bean back into itself with `@Autowired @Lazy private var self: ...?` and route via `self ?: this`) is **no longer used in the codebase** — replaced by the two-bean split during ticket #B3. If you're tempted to reach for it, that's the signal that a split is what you actually want.

### `@Transactional` — same rule

Self-calls bypass the transaction boundary. The same split-into-two-beans fix applies : extract the `@Transactional` method into a dedicated bean, inject it where you need the wrapped behaviour, never call `this.transactionalMethod()` from inside the same class.

## When NOT to wrap a method in `@Transactional`

A `@Transactional` method holds a database connection from the JPA pool for its entire duration. **Don't wrap a method that calls a slow external resource** (LLM, REST upstream) inside `@Transactional` — the connection sits idle for 30+ seconds while the call resolves, starving the pool under any concurrent load.

```kotlin
// CORRECT — TickerNarrativeExecutor is deliberately NOT @Transactional
@Component
class TickerNarrativeExecutor(/* … */) {
  fun execute(symbol: String, jobId: UUID): TickerNarrativeSnapshot {
    val context = loadContext(symbol)               // reads DB — own short tx via repos
    val raw = llm.complete(prompt, …)               // 30s LLM call, no DB lock held
    val snapshot = persister.persist(parsed, …)     // writes DB — own short tx
    return snapshot
  }
}
```

Split into multiple short transactions instead. Each `JpaRepository` call has its own implicit transaction, and explicit `@Transactional` services like `TickerNarrativeJobStore.complete(...)` are sized to one short DB write each.

`@Transactional(readOnly = true)` on read-heavy methods is fine (helps Hibernate skip dirty-checking) and doesn't have the connection-holding cost since most read paths return quickly.

## Configuration injection — `@Value` with defaults, or `AppConfigService` for runtime knobs

Two patterns coexist :

### `@Value("\${key:default}")` — for boot-time-fixed config

```kotlin
@Component
class OllamaClient(
  @Value("\${ollama.base-url:http://localhost:11434}") private val baseUrl: String,
  /* … */
)
```

Always provide a default after the `:` — a missing key without a default fails the application context at startup, which is a footgun for newcomers cloning the repo. Empty string is a valid default for required secrets : `@Value("\${anthropic.api.key:}")` boots cleanly and `ClaudeClient` raises a clear "missing key" error on the first actual call.

### `AppConfigService.getString/getInt(...)` — for runtime-editable config

Anything the user can flip from `/settings/configuration` reads through `AppConfigService` *per call*, not at construction. This includes : `<x>.provider`, `<x>.api-key`, cache TTL, LLM timeout. The pattern : YAML default injected via `@Value` into `AppConfigService` (for first-boot bootstrap), then DB overrides take precedence, then runtime reads hit the layered value.

Rule of thumb : *can the user toggle this without restarting the backend?* If yes, route through `AppConfigService`. If no, plain `@Value` is fine.

## Caching — Caffeine via `CaffeineCacheManager`

The cache stack :

1. **`MarketConfig` declares the cache manager** with a fixed list of named caches (`market-chart`, `news-by-symbol`, `symbol-search`, `sector-by-symbol`, `analyst-recommendations`, `earnings`). All share one Caffeine spec today (`expireAfterWrite(ttlMinutes)`, `maximumSize(500)`).
2. **Services use `@Cacheable(<NAME>, key = "…")`** with the cache name from `MarketConfig.Companion`. The key is always a SpEL expression starting with `#symbol.toUpperCase()` (Java method ; see `kotlin-idioms` for the SpEL gotcha).
3. **Dynamic TTL via `@TransactionalEventListener(AFTER_COMMIT)`** : when the user changes the TTL from `/settings/configuration`, `AppConfigService.set` is `@Transactional` and publishes `ConfigChangedEvent` last-line-before-commit. The listener (`CacheTtlListener`) rebuilds the Caffeine spec after the commit succeeds.

```kotlin
// CORRECT — wait for transaction commit before flushing the cache
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
fun onConfigChanged(event: ConfigChangedEvent) { /* rebuild cache spec */ }

// WRONG — fires before commit, rebuilds for a config change that may roll back
@EventListener
fun onConfigChanged(event: ConfigChangedEvent) { /* rebuild cache spec */ }
```

The plain `@EventListener` would flush the entire cache for a transaction that then rolls back. `AFTER_COMMIT` defers until the change is durable. Pinned in `MarketConfig` KDoc (audit 2026-05-06 finding #5).

**Cache placement** : `@Cacheable` lives on the application **service**, not on the adapter (with one legacy exception in `TwelveDataClient`). Full rationale in [`hexagonal-ddd > Cache placement`](../hexagonal-ddd/SKILL.md#cache-placement).

**New cache name** : add a `const val FOO_CACHE = "foo"` in `MarketConfig.Companion`, append it to the `CaffeineCacheManager` constructor list, and the existing TTL listener picks it up for free.

## Events — `ApplicationEventPublisher`

In-process pub/sub for cross-bean signals. Two listener flavours :

- **`@EventListener(ApplicationReadyEvent::class)`** — boot hooks. Used by `OrphanedJobCleanupListener` to flip dangling `PENDING` rows to `ERROR` so a hot-reload mid-LLM doesn't leave the frontend SSE waiting.
- **`@TransactionalEventListener(phase = AFTER_COMMIT)`** — react to a domain event after its publishing transaction durably commits. Default phase choice for any listener that mutates state (cache, files) based on a DB change.

Custom events are plain Kotlin classes — no inheritance from `ApplicationEvent` required since Spring 4.2. `data class ConfigChangedEvent(val key: String, val value: String)` is the canonical shape.

Don't reach for events when a direct method call would do. Events earn their keep when the publisher shouldn't know its consumers (cache rebuild on config change : `AppConfigService` doesn't import `MarketConfig`).

## YAML & profiles

- `application.yml` — defaults, committed. No secrets, no API keys.
- `application-local.yml` — local profile, **gitignored**. Real API keys (`anthropic.api.key`, `market.finnhub.api-key`, `market.twelvedata.api-key`) live here. Activated by setting `SPRING_PROFILES_ACTIVE=local`.
- `application-test.yml` — test profile (if needed), committed. Overrides `spring.datasource.url` for the integration test database.

Environment variable injection uses `${ENV_VAR:default}` syntax — see `server.port: ${BACKEND_HOST_PORT:8080}` in `application.yml`. The default is what runs without any `.env` file.

`@Profile("local")` annotations on beans are rare in this project — runtime branching via `AppConfigService` covers the same need without rebooting.

## Flyway

- Scripts in `backend/src/main/resources/db/migration/` named `V<N>__<short_snake_case>.sql`.
- **Append-only**. Never rewrite a shipped V*. A typo in `V5__foo.sql` after it shipped → fix in `V6__foo_fixup.sql`. Flyway will refuse to start if a checksum mismatches.
- One numbered file per logical schema change. Don't batch unrelated changes into one V*.
- `spring.flyway.repair-on-migrate: true` lives **only** in `application-local.yml` — it papers over local mismatches during development. Never enable it in `application.yml` ; in prod, a checksum mismatch should be a hard failure.

## Integration tests — real PostgreSQL, no DB mocks

Controller tests use **`@SpringBootTest`** (full context) — not `@WebMvcTest` slice tests — because the project deliberately exercises the wire from controller → service → JPA → PostgreSQL. The test stack assumes a running database on `localhost:5432`, started by `tilt up` or `docker compose up postgres` in CI.

```kotlin
@SpringBootTest
@AutoConfigureMockMvc
class NewsControllerTest(@Autowired val mvc: MockMvc, /* … */) {
  /* … */
}
```

External HTTP boundaries are mocked at the wire layer with **`okhttp3.mockwebserver.MockWebServer`**, not by stubbing the port. Reasoning : testing the adapter exercises the wire mapping too (`FinnhubMappers.toDomain` is a real source of bugs). Stubbing the port skips the part of the code most likely to drift.

JUnit 5, `mockito-kotlin` for the rare cases where stubbing is the right tool (controller tests with a fake `*Service` to isolate routing).

Pair with [`folders-structure-backend > Tests`](../folders-structure-backend/SKILL.md) for where test files live.

## Logging — SLF4J via `LoggerFactory.getLogger(javaClass)`

```kotlin
private val log = LoggerFactory.getLogger(javaClass)
log.info("Snapshot persisted symbol={} jobId={}", symbol, jobId)
```

Parameterised messages, not string interpolation — SLF4J skips the formatting if the level is disabled. Level convention :
- `DEBUG` — runtime trace (cache hit/miss, scheduler ticks, dedup, SSE register/unregister)
- `INFO` — milestones (job kick, snapshot persisted, config bumped, provider switched)
- `WARN` — fail-soft (rate-limit absorbed, fallback null on `/price-target`, retry parser)
- `ERROR` — user-visible errors or interrupted jobs

This is the *target* convention — the codebase has historical drift (some `log.info` should be `log.debug`), tracked under the "Gestion d'erreur transverse / Logging" dette technique ticket.

## When NOT to follow these patterns

- **Pure-Kotlin tests** of domain logic (`IndicatorCalculator`, `CoherenceScorer`, parsers) — no Spring annotations, no `@SpringBootTest`. Direct unit tests with JUnit 5.
- **One-off scripts or migrations** — Spring isn't the answer ; a plain `main()` or a Flyway Java migration is.
- **CLI utilities** — none today, but if one appears, prefer `CommandLineRunner` over a `@SpringBootApplication` reskin.
