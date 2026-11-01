---
name: spring-boot
description: Spring Boot conventions for the PortfolioAI backend (Kotlin + Spring Boot 4.x). Use when adding a controller, service, configuration class, event listener, transactional boundary, runtime-editable setting, profile-specific bean, Flyway migration, or integration test. Skips general Spring tutorial content.
---

# Spring Boot Conventions

Project-specific choices and the gotchas worth pinning. Pair with [`kotlin-idioms`](../kotlin-idioms/SKILL.md) and [`hexagonal-ddd`](../hexagonal-ddd/SKILL.md). Paths are relative to `projects/backend/`.

## Stereotypes

- **`@Service`** — `application/` orchestrators ; where `@Transactional` lives.
- **`@Component`** — adapters (`FrankfurterForexClient`), event listeners (`TradeMovementSyncListener`).
- **`@Configuration`** — bean factories in `<context>/infrastructure/…` (`ForexHttpConfig`, `SecurityConfig`).
- **`@RestController`** — under `<context>/infrastructure/http/`, depends on application services only, with an OpenAPI `@Tag`.
- No `@Repository` on Spring Data interfaces ; a hand-written query class may carry one (`AccountCashFlowQuery`).

## Errors

- **`ResponseStatusException` is the dominant path** : `badRequest()` (`shared/RequestValidation.kt`) for a 400, `ResponseStatusException(NOT_FOUND)` for a 404 — a foreign or missing id is a 404, never a 403.
- `GlobalExceptionHandler` is the one `@RestControllerAdvice` : `IllegalArgumentException` → 400, `NoSuchElementException` → 404, `DataIntegrityViolationException` → 409, or 400 when the value itself is refused (numeric overflow, check constraint), `UpstreamUnavailableException` → 503. Map a new exception type there.

## The AOP proxy rule

CLAUDE.md states it : no self-call on a proxied method. **The fix is always a split into two beans**, never `@Lazy self` : `TradeMovementSyncListener` delegates to the `@Transactional` `AccountTradeSyncService` ; `AccountReconciler` is its own bean so two services reach `reconcile` through the proxy.

## Transactions and time

- Writes `@Transactional`, reads `@Transactional(readOnly = true)`.
- **Never hold a transaction across a slow external call** : `ForexService` is deliberately not transactional.
- `open-in-view: false` and `ddl-auto: validate` : load what a response needs inside the service, and a schema change needs its migration.
- **Inject `Clock`** (`shared/ClockConfig`, UTC) rather than call `LocalDate.now()`, so a test can fix the day. A market "today" is New York's : `LocalDate.now(clock.withZone(NEW_YORK))`, as in `DayBarsService`.

## Configuration

- **`@Value("\${key:default}")`** — boot-time config. Give a default unless `application.yml` holds the key. `@ConfigurationProperties` only when a group of keys shares a prefix.
- **`AppConfigService`** — what the user changes without a reboot, read **per call**. One key today, `ConfigKeys.ALLOWED_EMAILS`. Adding one follows the three steps of the `ConfigKeys` KDoc.

## Events

Custom events are plain data classes, for write-side effects across contexts (see `hexagonal-ddd`). The canonical flow : `TradeEntryService` does `saveAndFlush`, so the FK target exists in the transaction, then publishes `TradeChangedEvent` ; on delete it publishes **before** deleting. `TradeMovementSyncListener` (`@EventListener`, synchronous, same transaction) applies it : trade and movement commit or roll back together.

`@EventListener` when both sides must stay consistent. `@TransactionalEventListener(AFTER_COMMIT)` is the alternative for a side effect that must not fire on a rollback ; none exists today.

## Pageable defaults — sort resolution

With several URL `sort` params, the resolver's merge with an annotation default silently ignored the URL sort. So the controller declares only `@PageableDefault(size = N)`, and the service applies its default :

```kotlin
val effective =
  if (pageable.sort.isUnsorted) PageRequest.of(pageable.pageNumber, pageable.pageSize, DEFAULT_SORT)
  else pageable
```

`StatEntryService.findAllPaged` is the reference. Exception : a ledger whose order carries meaning fixes it and ignores the URL sort (`AccountService`).

The service returns `Page<T>`, the controller maps it with `toPageResponse()` : never `Page<T>` in a response body, Spring Data does not commit to its JSON. The frontend appends a tie-breaker (`createdAt,desc`) after the user's sort, so rows tied on a low-cardinality column stay stable across pages.

## Profiles and security

- `application.yml`, `application-local.yml`, `application-prod.yml` are committed, without secrets. No `application-test.yml` : `testsupport/` publishes `spring.datasource.*` before a context boots.
- `@Profile` only for wiring that truly differs : `local` (`LocalDataSeeder`), `prod` (`SpaFallbackConfig`), `e2e` (`E2eSessionController`, which refuses to run with `prod`).
- **Two security chains** : the session chain (`SecurityConfig`, sessions in JDBC via `SessionStoreConfig`) and the scanner's bearer-token chain (`ScannerSecurityConfig`, `@Order(1)`). A new scanner route is added to its matcher on purpose.

## Flyway

- `src/main/resources/db/migration/V<N>__<short_snake_case>.sql`, next number from the folder.
- **Append-only** : fix forward, a checksum mismatch stops the boot. `repair-on-migrate` lives only in `application-local.yml`.
- Postgres enums map to Kotlin enums by name (`@JdbcTypeCode(NAMED_ENUM)`) : renaming a constant needs a migration.
- **A migration that rewrites data needs a test in `migration/MigrationsOnDataTest.kt`**, seeded at the version before it : an empty database runs every `UPDATE` on nothing, which is how V23 passed CI and failed at deploy.

## Tests

- **`@SpringBootTest` on real PostgreSQL is the default** for anything touching JPA, constraints, events or security filters. `AuthService` is a `@MockitoBean` so the current user is fixed. Postgres is the Testcontainers singleton (`testsupport/PostgresContainer.kt`).
- Keep the context config identical across classes so Spring reuses it. A per-class `@TestPropertySource` is for a feature that needs a property (`ScannerIntegrationTest`), never `@DirtiesContext`.
- **`@WebMvcTest(<Controller>::class, GlobalExceptionHandler::class)`** with `@AutoConfigureMockMvc(addFilters = false)` — only for a pure HTTP contract (`ConfigControllerTest`, `StatReviewControllerTest`). Without `GlobalExceptionHandler` an error status reads as a 500. In Spring Boot 4 these annotations live in `org.springframework.boot.webmvc.test.autoconfigure`.
- **Plain JUnit** for pure logic (`StatMetricsTest`, `TradePositionCalculatorTest`).
- **External HTTP** : `mockwebserver3.MockWebServer`, not a port stub, which would skip the wire mapping (`FrankfurterForexClientTest`).

## Logging

Parameterised SLF4J messages. CLAUDE.md bans PII ; also, `AppConfigService.set` logs the key, never the value, the whitelist being a list of emails. `WARN` for a tolerated failure, `ERROR` for a user-visible one.

## Comments in YAML

[`CLAUDE.md > Comments`](../../CLAUDE.md#comments--the-strict-minimum) applies to `application*.yml` : keep what carries a constraint (`baseline-version: 0`, why zero), drop the tutorials.
