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

### Grouped `@Value` via `@Component` data class — for ≥3 related keys

When a bean grows past 3 `@Value` parameters that conceptually belong together, group them into a dedicated `@Component` data class and inject that. Keeps the consumer's constructor short and the grouping explicit. The pattern in `config/application/` :

```kotlin
@Component
data class SecretsDefaults(
  @Value("\${market.twelvedata.api-key:}") val twelveDataApiKey: String,
  @Value("\${market.finnhub.api-key:}") val finnhubApiKey: String,
  @Value("\${anthropic.api.key:}") val anthropicApiKey: String,
)

@Service
class AppConfigService(
  private val repository: AppConfigRepository,
  private val secrets: SecretsDefaults,
  private val dataProviders: DataProvidersDefaults,
  private val llm: LlmDefaults,
  /* … */
)
```

The codebase has three such groups today (`SecretsDefaults`, `DataProvidersDefaults`, `LlmDefaults`), all in `config/application/`, all reduced `AppConfigService`'s constructor from 14 params to 6 (ticket #B6, livré 2026-05-15).

**Why not `@ConfigurationProperties`** — that's the canonical Spring Boot answer when keys share a prefix (e.g. `market.foo`, `market.bar` under `prefix = "market"`). This project's runtime config keys are spread across four roots (`market.*`, `anthropic.*`, `llm.*`, `news.*`, etc.) that grew organically and back env-var bindings already documented in the README. A single `@ConfigurationProperties` can't span them cleanly, and renaming the YAML keys would break the env-var contract. The grouped `@Component` pattern reads identically at the consumer and preserves the keys.

Use `@ConfigurationProperties` when the YAML *does* share a prefix (a new isolated subtree). Use grouped `@Value` data classes when consolidating existing scattered keys.

### Constructor with 8+ deps : grouping vs `@Suppress` — pick by pattern

Detekt's `LongParameterList` fires at 8 constructor params. Two distinct patterns govern what to do :

| Pattern | Example | Fix |
|---------|---------|-----|
| **Config-defaults bean** — `@Value` constructor params bundling YAML keys with no behaviour | Old `AppConfigService` (14 `@Value`) | **Group** into `@Component data class` per concern (see above). Don't suppress — the grouping is a real readability win. |
| **Orchestrator with collaborators** — `@Service` coordinating N distinct beans, each doing a distinct piece of a pipeline at a distinct phase | `TickerNarrativeExecutor` (8 deps : market load → prompt resolve → LLM call → parse → validate → persist → SSE publish → score record) | **`@Suppress("LongParameterList")` at the class** with a comment explaining why. Façade-grouping (parser+validator together, persister+scoreRecorder together) usually hurts here because each collaborator has different transactional / failure / event-granularity contracts. |

The distinction is **value carriers vs collaborators**. Value carriers compress into a data class with no semantic loss. Collaborators don't — they each have a distinct method signature, a distinct failure mode, a distinct point in the flow where they fire.

When in doubt, ask : *if I bundle these into one façade, does the consumer's code read more clearly or less ?* If "less", suppress.

### `AppConfigService.getString/getInt(...)` — for runtime-editable config

Anything the user can flip from `/settings/configuration` reads through `AppConfigService` *per call*, not at construction. This includes : `<x>.provider`, `<x>.api-key`, cache TTL, LLM timeout. The pattern : YAML defaults injected via the `*Defaults` `@Component` groups above (for first-boot bootstrap), then DB overrides take precedence, then runtime reads hit the layered value.

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

## Tests — slice by default, full context only when needed

The project picks the **narrowest** test slice that exercises the contract. Three flavours in use today :

### `@WebMvcTest(<Controller>::class, GlobalExceptionHandler::class)` — for controllers

Used by **all 13 controller tests**. Boots Spring's Web MVC layer only — Jackson, exception handlers, request mappings — and **mocks all `@Service` beans** the controller depends on via `@MockitoBean`. Cold start ~0.5 s vs 3-5 s for `@SpringBootTest`.

```kotlin
@WebMvcTest(NewsController::class, GlobalExceptionHandler::class)
class NewsControllerTest {
  @Autowired private lateinit var mvc: MockMvc
  @MockitoBean private lateinit var service: NewsService

  @Test
  fun `GET news returns 503 when the upstream is unavailable`() {
    given(service.forSymbol(any(), any())).willThrow(UpstreamUnavailableException("rate-limited"))
    mvc.perform(get("/api/market/ticker/AAPL/news")).andExpect(status().isServiceUnavailable)
  }
}
```

The `GlobalExceptionHandler::class` in the slice declaration is the project's standard — without it, the exception → status mapping (`UpstreamUnavailableException` → 503, `NoSuchElementException` → 404, etc.) isn't wired, and 503-path tests would see a generic 500.

### `@SpringBootTest` — only for genuinely integration cases

Reserved for tests that need the **real** Spring context for things slice tests can't fake : `@TransactionalEventListener(AFTER_COMMIT)` wiring (needs a real `PlatformTransactionManager`), full bean-graph smoke tests, JPA-against-PostgreSQL behaviour. Two usages in the codebase today : `BackendApplicationTests` (context-boots smoke) and `CacheTtlListenerIntegrationTest` (transactional event flow).

```kotlin
@SpringBootTest
class CacheTtlListenerIntegrationTest {
  // Tests @TransactionalEventListener(AFTER_COMMIT) — can't be exercised in a slice.
}
```

**Don't reach for `@SpringBootTest` on a controller** — if you find yourself wanting it, it usually means a `@MockitoBean` would do the same job at ~10× the speed. The integration path is genuinely useful for behaviour the slice can't fake, not for "I want to be sure everything is wired".

### Plain JUnit (no Spring) — for domain logic

Pure-Kotlin tests of domain logic (`IndicatorCalculator`, `CoherenceScorer`, parsers, mappers) — no Spring annotations at all. Direct unit tests with JUnit 5 + `mockito-kotlin` where stubbing is needed.

### External HTTP boundaries — `MockWebServer`, not port stubs

For adapter tests that exercise the wire mapping (`FinnhubMappers.toDomain`, Twelve Data quirks parsing), mock at the wire layer with **`okhttp3.mockwebserver.MockWebServer`**. Stubbing the port skips the wire mapping — which is exactly the bit most likely to drift when an upstream changes shape.

Pair with [`folders-structure-backend > Tests`](../folders-structure-backend/SKILL.md) for where test files live.

### Test performance — the leverage points, ranked

The slice-by-default strategy above is the big win (×6-10 on cold start vs `@SpringBootTest` for controller tests). If you reach for a perf optimisation past that, do them in this order :

1. **Measure first**. `./gradlew test --info` (or `--scan`) prints time per class. Find the top 5 slowest and ask : are they genuinely integration paths or are they `@SpringBootTest` where `@WebMvcTest` would do ? Premature parallelisation on a test suite where one class burns 80 % of the wall time wins nothing.

2. **Share configuration across `@SpringBootTest` classes.** Spring caches the application context across classes when their configuration is *identical* — same properties, same `@MockitoBean` set, same profiles. With N integration tests sharing a config, you pay the boot once. To preserve the cache : avoid per-class `@TestPropertySource` with diverging values, avoid `@DirtiesContext` (forces a reload), and keep `@MockitoBean` mocks consistent. Today the project has 2 `@SpringBootTest` ; if Phase 6 introduces more on `aggregation/`, this is the discipline that keeps them cheap.

3. **Parallel execution at the class level.** Drop a `src/test/resources/junit-platform.properties` :
   ```properties
   junit.jupiter.execution.parallel.enabled = true
   junit.jupiter.execution.parallel.mode.default = same_thread
   junit.jupiter.execution.parallel.mode.classes.default = concurrent
   ```
   Runs classes concurrently on a thread per core ; methods inside a class stay sequential. Gain is proportional to core count (~×4 on an 8-core M1). **Risk** : tests that touch shared state (a static singleton, the cache, a global mock) will flake. Audit before enabling — the project's `@WebMvcTest` slices are reasonably independent today, but `@SpringBootTest` classes sharing the cached context need to be confirmed safe under concurrent execution.

4. **Gradle build cache.** `./gradlew test --build-cache` reuses task outputs when inputs haven't changed. On a local re-run with no source changes, the test task is a no-op. Free in dev, neutral in CI fresh clones.

**Not worth the ROI here** : migrating to kotest, replacing Postgres with Testcontainers (you already have a real Postgres via Tilt), splitting beans to shrink context scope (over-engineering).

**Trigger** : start mesuring + intervening when the suite passes 1 min in CI on the test step alone. Under that, the discipline above keeps it fast enough.

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
