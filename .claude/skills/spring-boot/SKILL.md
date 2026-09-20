---
name: spring-boot
description: Spring Boot conventions for the PortfolioAI backend (Kotlin + Spring Boot 3.x). Use when adding a controller, service, configuration class, event listener, transactional boundary, runtime-editable setting, profile-specific bean, Flyway migration, or integration test. Skips general Spring tutorial content.
---

# Spring Boot Conventions

Project-specific Spring choices, plus the AOP / proxy gotchas worth pinning. Pair with [`kotlin-idioms`](../kotlin-idioms/SKILL.md) (Kotlin rules) and [`hexagonal-ddd`](../hexagonal-ddd/SKILL.md) (ports / adapters / fail-soft). Paths below are relative to `projects/backend/`.

## Stereotypes

- **`@Service`** — `application/` orchestrators (`TradeEntryService`, `AccountService`, `AccountReconciler`, `AppConfigService`, `ForexService`…). Where `@Transactional` lives.
- **`@Component`** — everything else Spring-managed: adapters (`FrankfurterForexClient`), event listeners (`TradeMovementSyncListener`).
- **`@Configuration`** — bean factories in `<context>/infrastructure/…`: `forex/infrastructure/http/ForexHttpConfig` (the `forexRestClient` bean), `auth/infrastructure/security/SecurityConfig` + `LocalNoAuthSecurityConfig`, `shared/SpaFallbackConfig`.
- **`@RestController`** — under `<context>/infrastructure/http/`. Depends on application services only.
- **`@RestControllerAdvice`** — one only (`shared/GlobalExceptionHandler`). Map new exception types there (`IllegalArgumentException` → 400, `NoSuchElementException` → 404, `DataIntegrityViolationException` → 409, `UpstreamUnavailableException` → 503).

No `@Repository` — Spring Data JPA interfaces extending `JpaRepository<T, ID>` don't need it.

## The AOP proxy rule — no self-calls

`@Transactional` (and `@Async` / `@Cacheable`, should they come back) are AOP proxies. Calling the annotated method via `this.foo()` from inside the same bean **bypasses the proxy** — it runs non-transactional (or synchronous / uncached).

**Fix is always the same: split into two beans.** Real examples:

```kotlin
// The listener delegates to a separate @Transactional bean instead of annotating itself.
@Component
class TradeMovementSyncListener(private val syncService: AccountTradeSyncService) {
  @EventListener fun onTradeChanged(event: TradeChangedEvent) = syncService.sync(event)
}

// AccountReconciler is its own bean so AccountService and AccountTradeSyncService both reach
// `reconcile` through the proxy — it joins the caller's transaction.
@Service
class AccountReconciler(private val repo: AccountMovementRepository) {
  @Transactional fun reconcile(userId: UUID) { /* re-float the latest correction */ }
}
```

No `@Lazy self` injection — a split is what you actually want. `@EnableAsync` is still on `BackendApplication`, but no `@Async` method exists today ; if one is added, it goes on a dedicated bean, never called from its own class.

## Transaction boundaries

- **Writes** — `@Transactional` on the service method. **Reads** — `@Transactional(readOnly = true)` (lets Hibernate skip dirty-checking).
- **Never hold a transaction across a slow external call.** A `@Transactional` method keeps a DB connection for its whole duration. `ForexService` (Frankfurter HTTP call) is deliberately not transactional — keep any future upstream call outside the tx, and do the DB work in short transactions around it.

## Configuration injection

### `@Value("\${key:default}")` — boot-time-fixed config

Always provide a default after `:` — a missing key without default fails the context at startup. Real uses: `FrankfurterForexClient` (`forex.frankfurter.base-url:https://api.frankfurter.dev/v1`), `SecurityConfig` (`app.frontend-url:/`), `CustomOAuth2UserService` (`app.admin.emails:`). An empty default is fine for optional values.

Use `@ConfigurationProperties` only if a group of keys sharing one prefix appears ; today every consumer needs one or two keys, so plain `@Value` stays.

### `AppConfigService` — runtime-editable config

Anything the user can change from the settings page without a reboot reads through `AppConfigService` **per call**, not at construction. Today there is exactly one key: `ConfigKeys.ALLOWED_EMAILS` (`app.allowed.emails`, the login whitelist, read by `CustomOAuth2UserService` via `getAllowedEmails()`).

- YAML default injected by `@Value` into `AppConfigService`, DB override (`app_config` table) layered on top, primed into a `ConcurrentHashMap` at `@PostConstruct`.
- Adding a key = the three steps in the `ConfigKeys` KDoc: constant + `KNOWN_KEYS`, `@Value` default in `AppConfigService.defaultFor`, consumer reads through the service.
- Rule of thumb: *can the user change this without restarting?* If yes, `AppConfigService`. If no, plain `@Value`. Keep the list short.

## Caching

No Spring cache abstraction in use (no `CacheManager`, no `@Cacheable`). The only cache is a small standalone Caffeine `Cache` field inside `FrankfurterForexClient` (6 h TTL, nothing cached on failure). If a shared cache is ever needed, `@Cacheable` goes on the application service, not the adapter, and obeys the AOP split rule above.

## Events — `ApplicationEventPublisher`

In-process pub/sub for cross-context signals, used when the publisher shouldn't know its consumer. Custom events are plain Kotlin data classes (no `ApplicationEvent` inheritance).

The canonical flow — journal → account:

1. `TradeEntryService` saves with `repo.saveAndFlush(entry)` (so the FK target row exists in the tx), then `events.publishEvent(TradeChangedEvent(...))`. On delete it publishes with `profitDollars = null` *before* deleting the trade.
2. `TradeMovementSyncListener` (`@EventListener`, **synchronous, same transaction**) delegates to `AccountTradeSyncService.sync`. Trade and account movement commit or roll back together — a ledger failure fails the trade write.

Choose the listener flavour deliberately:

- **`@EventListener`** — runs inline in the publisher's transaction. Use when both sides must stay consistent (the journal → account case).
- **`@TransactionalEventListener(phase = AFTER_COMMIT)`** — runs only after the publishing tx durably commits. Use for side effects that must not fire on a rolled-back change and don't need to be atomic with it. Not used today.

Don't reach for events when a direct method call would do.

## Pageable defaults — sort resolution

Paginated listings use Spring's `Pageable` (`?page=N&size=N&sort=field,direction`). **The default sort belongs in the application service, NOT in `@PageableDefault`** — with multiple URL `sort` params the resolver's merge with an annotation default was inconsistent (the URL sort silently ignored). Owning it in the service is bug-proof and unit-testable.

```kotlin
// TradeEntryController — only the page-size default, never sort.
@GetMapping
fun findAll(
  /* filter params … */
  @PageableDefault(size = 50) pageable: Pageable,
): Page<TradeEntryDto> = service.findAllPaged(/* filter, */ pageable)

// TradeEntryService — apply the default sort iff the client sent none.
@Transactional(readOnly = true)
fun findAllPaged(filter: TradeEntryFilter = TradeEntryFilter(), pageable: Pageable): Page<TradeEntryDto> {
  val userId = authService.getCurrentUser().id
  val spec = TradeEntrySpecifications.matching(userId, filter)
  val effective =
    if (pageable.sort.isUnsorted) PageRequest.of(pageable.pageNumber, pageable.pageSize, DEFAULT_SORT)
    else pageable
  return repo.findAll(spec, effective).map { it.toDto() }
}

companion object {
  private val DEFAULT_SORT: Sort = Sort.by(Sort.Order.desc("tradeDate"), Sort.Order.desc("createdAt"))
}
```

**Frontend pairing** — the journal page appends a tie-breaker (`.append('sort', 'createdAt,desc')`) after the user's primary sort, so rows tied on a low-cardinality column stay deterministic across pages. Spring honours multiple `?sort=` params in declaration order.

Adopt this for any new paginated controller.

## YAML & profiles

- `src/main/resources/application.yml` — defaults, committed, no secrets.
- `application-local.yml` — local dev overrides (e.g. `spring.flyway.repair-on-migrate: true`), committed, no secrets (those live in `.env`).
- `application-prod.yml` — Cloud Run overrides, committed ; secrets come from GCP Secret Manager.
- **No `application-test.yml`** — `testsupport/TestcontainersBootstrap.kt` (JUnit Platform listener) publishes `spring.datasource.*` as system properties before any context boots.

Env injection: `${ENV_VAR:default}`. `@Profile` is used sparingly and only for wiring that genuinely differs per environment: `local-no-auth` (`LocalNoAuthSecurityConfig`, `LocalNoAuthFilter`, `LocalNoAuthUserInitializer`) vs `!local-no-auth` (`SecurityConfig`), and `prod` (`SpaFallbackConfig`). The Tiltfile picks the profile set.

## Flyway

- `src/main/resources/db/migration/V<N>__<short_snake_case>.sql` (latest: `V11__drop_pre_pivot_tables.sql`).
- **Append-only.** Never rewrite a shipped `V*` — fix forward in the next number. Flyway refuses to start on checksum mismatch.
- One file per logical schema change.
- `repair-on-migrate: true` lives **only** in `application-local.yml` ; in prod a checksum mismatch must be a hard failure.
- Postgres enums map to Kotlin enums by name (`@JdbcTypeCode(NAMED_ENUM)`) — renaming an enum constant needs a migration.

## Tests — slice by default, full context when the DB matters

### `@WebMvcTest(<Controller>::class, GlobalExceptionHandler::class)` — controller contract

Boots the Web MVC layer only and mocks services with `@MockitoBean`. Used by `ConfigControllerTest` and `AuthControllerTest`, with `@AutoConfigureMockMvc(addFilters = false)` to skip the security chain.

```kotlin
@WebMvcTest(ConfigController::class, GlobalExceptionHandler::class)
@AutoConfigureMockMvc(addFilters = false)
class ConfigControllerTest {
  @Autowired private lateinit var mvc: MockMvc
  @MockitoBean private lateinit var service: AppConfigService

  @Test
  fun `PUT config returns 400 on a blank value`() { /* … */ }
}
```

Include `GlobalExceptionHandler::class` whenever a test asserts an error status — without it the exception → status mapping isn't wired and you get a generic 500.

### `@SpringBootTest` — integration against real PostgreSQL

The default for module behaviour that depends on JPA, specifications, DB constraints or event wiring: `JournalIntegrationTest`, `AccountIntegrationTest`, `AccountTradeSyncIntegrationTest`, `AccountReconciliationIntegrationTest`, `CandidateIntegrationTest`, `StatsImportIntegrationTest`, `StatsListingIntegrationTest`, `LexiconIntegrationTest`, plus `BackendApplicationTests` (context smoke) and `LocalNoAuthIntegrationTest` (`@ActiveProfiles("local-no-auth")` security chain).

- `AuthService` is replaced with `@MockitoBean` so the current-user scope is deterministic.
- Postgres comes from the **Testcontainers singleton** (`testsupport/PostgresContainer.kt`, `withReuse(true)`), started once per JVM by the launcher listener. No DB mocks. Opt into reuse locally with `testcontainers.reuse.enable=true` in `~/.testcontainers.properties`.
- Keep the context config identical across classes (no per-class `@TestPropertySource`, no `@DirtiesContext`) so Spring reuses the cached context.

### Plain JUnit — domain logic

Pure-Kotlin tests without Spring: `TradePositionCalculatorTest`, `StatMetricsTest`, `TradeEntryCsvDecoderTest`, `StatEntryCsvDecoderTest`, `StatEntryCsvEncoderTest`, `AppConfigServiceTest`.

### External HTTP — `MockWebServer`, not port stubs

Adapter tests exercise the wire mapping against `okhttp3.mockwebserver.MockWebServer` (`FrankfurterForexClientTest`: payload parsing, 5xx / missing quote → `UpstreamUnavailableException`, cache hit). Stubbing the port would skip exactly the part that drifts when an upstream changes shape.

## Logging — SLF4J, no PII

```kotlin
private val log = LoggerFactory.getLogger(javaClass)
log.info("OAuth login (existing user) — id={} provider={}", existing.id, provider)
```

- Parameterised messages, not string interpolation.
- **Never log emails, `displayName` or `providerId`** — log the user UUID. `AppConfigService.set` logs only the key, never the value (the whitelist is a list of emails).
- Levels: `DEBUG` trace, `INFO` milestones, `WARN` fail-soft upstream errors (`FrankfurterForexClient`), `ERROR` user-visible failures.

## Comments — the strict minimum

See [`CLAUDE.md > Comments`](../../CLAUDE.md#comments--the-strict-minimum). This applies to
`application*.yml` too: a key whose name says it all needs no line above it. Keep the ones that
carry a constraint (`baseline-version: 0` — why zero and not one), drop the tutorials (how to create
an OAuth client, how to reset a database): those belong in the issue or in `docs/`.
