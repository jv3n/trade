---
name: spring-boot
description: Spring Boot conventions for the PortfolioAI backend (Kotlin + Spring Boot 3.x). Use when adding a controller, service, configuration class, `@Async` method, cache, event listener, transactional boundary, profile-specific bean, or integration test. Skips general Spring tutorial content.
---

# Spring Boot Conventions

Project-specific Spring choices, plus the AOP / proxy gotchas that bite enough to be pinned verbatim. Pair with [`kotlin-idioms`](../kotlin-idioms/SKILL.md) (Kotlin rules) and [`hexagonal-ddd`](../hexagonal-ddd/SKILL.md) (ports / adapters / fail-soft).

## Stereotypes

- **`@Service`** — `application/` orchestrators. Where `@Cacheable`, `@Async`, `@Transactional` live.
- **`@Component`** — everything else Spring-managed: adapters, listeners, routing clients.
- **`@Configuration`** — bean factories, placed in `<context>/infrastructure/` by default. Four exist: `MarketConfig` (cache manager — at root of `market/`, not `infrastructure/`, because the spec is shared cross-layer), `market/infrastructure/market/TwelveDataHttpConfig`, `news/infrastructure/news/FinnhubHttpConfig`, `analysis/infrastructure/AnalysisConfig` (declares the explicit `@Bean Clock` consumed by `JobEventPublisher`).
- **`@RestController`** — under `<context>/infrastructure/http/`. Depends on application services only.
- **`@RestControllerAdvice`** — one only (`shared/GlobalExceptionHandler`). Map new domain exceptions there.

No `@Repository` — Spring Data JPA interfaces extending `JpaRepository<T, ID>` don't need it.

## The AOP proxy rule — `@Async`, `@Cacheable`, `@Transactional` self-calls

All three are AOP proxies. Calling the annotated method via `this.foo()` from inside the same bean **bypasses the proxy** (runs synchronously / uncached / non-transactional). The single most common Spring footgun here.

**Fix is always the same: split into two beans.** Never `@Async` + caller in the same class. Never `@Cacheable` + consumer in the same class.

```kotlin
// CORRECT — @Async on a dedicated bean
@Component
class TickerNarrativeRunner(private val executor: TickerNarrativeExecutor) {
  @Async fun run(symbol: String, jobId: UUID) { executor.execute(symbol, jobId) }
}

// CORRECT — @Cacheable on cache-holder, consumer is a separate @Component
@Service
class SymbolSearchService(private val client: SymbolSearchClient) {
  @Cacheable(SYMBOL_SEARCH_CACHE, key = "#query.lowercase() + '|' + #limit")
  fun search(query: String, limit: Int): List<SymbolMatch> = client.fetch(query, limit)
}

@Component
class SymbolValidator(private val search: SymbolSearchService) {
  fun exists(symbol: String) = search.search(symbol, 10).any { it.symbol.equals(symbol, ignoreCase = true) }
}
```

The historical `@Lazy self` pattern (inject the bean into itself) is **no longer used** — replaced by the two-bean split during ticket #B3. If tempted by `@Lazy self`, a split is what you actually want.

## When NOT to wrap a method in `@Transactional`

A `@Transactional` method holds a DB connection for its entire duration. **Don't wrap a method that calls a slow external resource** (LLM, REST upstream) inside `@Transactional` — the connection sits idle 30+ s, starving the pool under concurrent load.

`TickerNarrativeExecutor` is deliberately NOT `@Transactional`. Split into multiple short transactions (each `JpaRepository` call has its own implicit tx; explicit `@Transactional` services like `TickerNarrativeJobStore.complete(...)` are sized to one short write each).

`@Transactional(readOnly = true)` on read-heavy methods is fine (lets Hibernate skip dirty-checking, doesn't hold connections long since reads return quickly).

## Configuration injection

### `@Value("\${key:default}")` — for boot-time-fixed config

Always provide a default after `:`. A missing key without default fails the app context at startup (footgun for newcomers). Empty string is fine for secrets: `@Value("\${anthropic.api.key:}")` boots, `ClaudeClient` raises a clear "missing key" error on first actual call.

### Grouped `@Value` via `@Component` data class — for ≥3 related keys

When a bean has 3+ `@Value` params that belong together, group them in a dedicated `@Component data class` and inject that. The project has three (`SecretsDefaults`, `DataProvidersDefaults`, `LlmDefaults` in `config/application/`), all reduced `AppConfigService` from 14 params to 6 (ticket #B6, 2026-05-15).

`@ConfigurationProperties` is the canonical Spring answer when keys share a prefix. This project's keys span multiple roots (`market.*`, `anthropic.*`, `llm.*`, `news.*`) that grew organically and back env-var bindings — a single `@ConfigurationProperties` can't span them cleanly. Use it when YAML *does* share a prefix; use grouped `@Value` when consolidating scattered keys.

### Long-parameter-list rule — group value carriers, suppress on collaborators

Detekt's `LongParameterList` fires at 8 params. Two distinct cases:

- **Config-defaults beans** (params are `@Value` value carriers with no behaviour) → **group** into a `@Component data class`. Don't suppress.
- **Orchestrators with collaborators** (each dep is a distinct piece of a pipeline, distinct method signature / failure mode / event-granularity) → **`@Suppress("LongParameterList")` at the class** with a comment. Façade-grouping hurts because each collaborator has different contracts. Example: `TickerNarrativeExecutor` (8 deps: market → prompt → LLM → parse → validate → persist → SSE → score).

When in doubt: *does bundling read more clearly or less?* If less, suppress.

### `AppConfigService.getString/getInt(...)` — for runtime-editable config

Anything the user can flip from `/settings/configuration` reads through `AppConfigService` **per call**, not at construction. YAML defaults inject via `*Defaults` `@Component` groups (for first-boot bootstrap), DB overrides take precedence.

Rule of thumb: *can the user toggle this without restarting?* If yes, route through `AppConfigService`. If no, plain `@Value` is fine.

## Caching — Caffeine via `CaffeineCacheManager`

1. **`MarketConfig` declares the cache manager** with a fixed list of named caches (`market-chart`, `news-by-symbol`, `symbol-search`, `sector-by-symbol`, `analyst-recommendations`, `earnings`). All share one Caffeine spec (`expireAfterWrite(ttlMinutes)`, `maximumSize(500)`).
2. **Services use `@Cacheable(<NAME>, key = "…")`** with the name from `MarketConfig.Companion`. Key always starts with `#symbol.toUpperCase()` (Java method; see `kotlin-idioms` for the SpEL gotcha).
3. **Dynamic TTL** via `@TransactionalEventListener(AFTER_COMMIT)` — when the user changes TTL, `AppConfigService.set` is `@Transactional` and publishes `ConfigChangedEvent` last-line-before-commit. `CacheTtlListener` rebuilds the Caffeine spec after commit.

```kotlin
// CORRECT — wait for commit before flushing
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
fun onConfigChanged(event: ConfigChangedEvent) { /* rebuild */ }

// WRONG — fires before commit, rebuilds for a config change that may roll back
@EventListener
fun onConfigChanged(event: ConfigChangedEvent) { /* … */ }
```

Pinned in `MarketConfig` KDoc (audit 2026-05-06 finding #5).

**Cache placement**: `@Cacheable` lives on the application service, not on the adapter (one legacy exception in `TwelveDataClient`). Rationale in [`hexagonal-ddd > Cache placement`](../hexagonal-ddd/SKILL.md#cache-placement).

**New cache name**: add `const val FOO_CACHE = "foo"` in `MarketConfig.Companion`, append to the `CaffeineCacheManager` constructor list. The TTL listener picks it up for free.

## Events — `ApplicationEventPublisher`

In-process pub/sub for cross-bean signals. Two listener flavours:

- **`@EventListener(ApplicationReadyEvent::class)`** — boot hooks. `OrphanedJobCleanupListener` uses it to flip dangling `PENDING` rows to `ERROR` so a hot-reload mid-LLM doesn't leave the frontend SSE waiting.
- **`@TransactionalEventListener(phase = AFTER_COMMIT)`** — react to a domain event after its publishing tx durably commits. Default for any listener that mutates state (cache, files) based on a DB change.

Custom events are plain Kotlin classes (no `ApplicationEvent` inheritance since Spring 4.2). `data class ConfigChangedEvent(val key: String, val value: String)` is the canonical shape.

Don't reach for events when a direct method call would do. Events earn their keep when the publisher shouldn't know its consumers.

## Pageable defaults — sort resolution

Paginated listings use Spring's standard `Pageable` parameter with `?page=N&size=N&sort=field,direction`. **The default sort belongs in the application service, NOT in `@PageableDefault`** — the resolver's behaviour with the URL `sort` param + the annotation default is inconsistent in practice : the URL sort can be silently ignored when both are present, depending on how the resolver merges them. Owning the decision in the service is bug-proof and trivially unit-testable.

```kotlin
// Controller — only declare the page-size default, never sort.
@GetMapping
fun findAll(
  /* filter params … */
  @PageableDefault(size = 50) pageable: Pageable,
): Page<TradeEntryDto> =
  service.findAllPaged(/* filter, */ pageable)

// Service — apply the default sort iff the client sent none.
@Transactional(readOnly = true)
fun findAllPaged(filter: Filter, pageable: Pageable): Page<TradeEntryDto> {
  val spec = TradeEntrySpecifications.matching(/* … */)
  val effective =
    if (pageable.sort.isUnsorted)
      PageRequest.of(pageable.pageNumber, pageable.pageSize, DEFAULT_SORT)
    else pageable
  return repo.findAll(spec, effective).map { it.toDto() }
}

companion object {
  private val DEFAULT_SORT: Sort =
    Sort.by(Sort.Order.desc("tradeDate"), Sort.Order.desc("createdAt"))
}
```

**Frontend pairing** — the journal page sends a tie-breaker secondary sort on top of the user's primary, so rows tied on the primary axis (low-cardinality columns like `play` / `pattern`) stay deterministic across pages :

```typescript
params = params
  .append('sort', `${page.sortField},${page.sortDirection}`)
  .append('sort', 'createdAt,desc');
```

Spring honours multiple `?sort=` params in declaration order. Primary first, tie-breaker second.

Verbatim in `TradeEntryController` + `TradeEntryService.findAllPaged`. Adopt for any new paginated controller.

## YAML & profiles

- `application.yml` — defaults, committed. No secrets.
- `application-local.yml` — local profile, committed. Behaviour overrides for dev (no secrets — those live in `.env`). Activated by `SPRING_PROFILES_ACTIVE=local`.
- `application-prod.yml` — prod profile, committed. Cloud Run overrides (no secrets — those come via `--update-secrets` from Secret Manager). Activated by `SPRING_PROFILES_ACTIVE=prod`.
- **No `application-test.yml`** — integration tests get their datasource coordinates from Testcontainers via a JUnit Platform listener (`testsupport/PostgresContainer.kt` + `TestcontainersBootstrap.kt`) that publishes `spring.datasource.url/username/password` as system properties before any Spring context boots. System properties outrank `application.yml`, so no test-profile YAML needed.

Env injection: `${ENV_VAR:default}`. `@Profile("local")` annotations are rare — runtime branching via `AppConfigService` covers the same need without reboot.

## Flyway

- `backend/src/main/resources/db/migration/V<N>__<short_snake_case>.sql`.
- **Append-only**. Never rewrite a shipped V*. A typo in `V5__foo.sql` post-ship → fix in `V6__foo_fixup.sql`. Flyway refuses to start on checksum mismatch.
- One numbered file per logical schema change. Don't batch unrelated changes.
- `spring.flyway.repair-on-migrate: true` lives **only** in `application-local.yml`. Never in `application.yml`; in prod, a checksum mismatch should be a hard failure.

## Tests — slice by default, full context only when needed

### `@WebMvcTest(<Controller>::class, GlobalExceptionHandler::class)` — for controllers

Used by **all 13 controller tests**. Boots Web MVC layer only — Jackson, exception handlers, mappings — and **mocks all `@Service` beans** via `@MockitoBean`. Cold start ~0.5 s vs 3–5 s for `@SpringBootTest`.

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

`GlobalExceptionHandler::class` in the slice is mandatory — without it the exception → status mapping isn't wired, and 503-path tests would see a generic 500.

### `@SpringBootTest` — only for genuinely integration cases

Reserved for things slices can't fake: `@TransactionalEventListener(AFTER_COMMIT)` wiring (needs a real `PlatformTransactionManager`), full bean-graph smoke tests, JPA-against-PostgreSQL behaviour. Three usages today: `BackendApplicationTests` (context-boots smoke), `CacheTtlListenerIntegrationTest` (transactional event flow), `LocalNoAuthIntegrationTest` (full security chain with the `local-no-auth` profile).

Postgres for these tests is provisioned by **Testcontainers** — a singleton container (`testsupport/PostgresContainer.kt`) boots once per JVM via a JUnit Platform launcher listener. Zero annotations on the test class. Docker is the only host prerequisite (already required for Tilt anyway). Opt into reuse globally with `echo "testcontainers.reuse.enable=true" >> ~/.testcontainers.properties` so the container survives between `./gradlew test` invocations (~5 s saved per run).

**Don't reach for `@SpringBootTest` on a controller** — if tempted, a `@MockitoBean` would do the same job ~10× faster.

### Plain JUnit (no Spring) — for domain logic

Pure-Kotlin tests of domain logic (`IndicatorCalculator`, `CoherenceScorer`, parsers, mappers). Direct JUnit 5 + `mockito-kotlin`.

### External HTTP boundaries — `MockWebServer`, not port stubs

For adapter tests that exercise wire mapping (`FinnhubMappers.toDomain`, Twelve Data quirks), mock at the wire layer with **`okhttp3.mockwebserver.MockWebServer`**. Stubbing the port skips wire mapping — exactly the bit most likely to drift when an upstream changes shape.

### Test performance levers (in order)

1. **Measure first.** `./gradlew test --info` prints time per class. Find the top 5 slowest and ask: integration paths, or `@SpringBootTest` where `@WebMvcTest` would do?
2. **Share `@SpringBootTest` config across classes.** Spring caches the context across classes when config is *identical*. Avoid per-class `@TestPropertySource` divergence, avoid `@DirtiesContext` (forces reload).
3. **Testcontainers reuse.** With `withReuse(true)` on the singleton + `testcontainers.reuse.enable=true` in `~/.testcontainers.properties`, the Postgres container survives across `./gradlew test` runs — first run pays ~5 s, subsequent runs ~0 s container boot. CI runners are ephemeral so the gain is dev-side only.
4. **Parallel execution at class level** via `src/test/resources/junit-platform.properties` (`parallel.enabled=true`, `parallel.mode.classes.default=concurrent`). Gain ~×4 on an 8-core M1. Risk: tests touching shared state will flake — audit before enabling. Risk for our setup: every `@SpringBootTest` class hits the same Postgres container ; tests that mutate global state (`app_config` rows, user table) would interfere.
5. **Gradle build cache.** `./gradlew test --build-cache` for free dev re-runs.

Trigger: start intervening when the suite passes 1 min in CI on the test step alone.

> **Why Testcontainers** — the historical position « Testcontainers is not worth the perf overhead » was *perf*-framed and wrong for this project. The deciding factor is **isolation/correctness** : tests have nothing to do with Tilt or docker-compose dev infra, and forcing the dev to remember `tilt up` before `./gradlew test` is a leaky abstraction. Migrated 2026-05-24.

## Logging — SLF4J

```kotlin
private val log = LoggerFactory.getLogger(javaClass)
log.info("Snapshot persisted symbol={} jobId={}", symbol, jobId)
```

Parameterised messages, not string interpolation. Level convention: `DEBUG` runtime trace, `INFO` milestones, `WARN` fail-soft, `ERROR` user-visible errors. Codebase has some historical drift tracked under "Gestion d'erreur transverse / Logging" dette.
