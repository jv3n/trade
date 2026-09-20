---
name: kotlin-idioms
description: Opinionated Kotlin conventions for the PortfolioAI backend (Kotlin + Spring Boot). Use when writing or reviewing Kotlin code — imports, constructor injection, null handling, validation, constants, mapper extension functions, sealed/enum choice, scope functions. Skips general Kotlin tutorial content the model already knows.
---

# Kotlin Idioms

Project-specific Kotlin choices — the calls *this project* makes when Kotlin offers two reasonable options, plus the JVM/Spring gotchas worth pinning. Code lives under `projects/backend/src/main/kotlin/com/portfolioai/`.

Formatter is **ktfmt Google style via Spotless** (`./gradlew spotlessApply`).

## Imports — no wildcards

**Always explicit, one symbol per line**, even past 5 members.

```kotlin
// CORRECT
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull

// WRONG
import org.junit.jupiter.api.Assertions.*
```

Spotless runs a custom `no-wildcard-imports` check (`build.gradle.kts`) that fails on **any** wildcard — no allowlist. The root `.editorconfig` pins `ij_kotlin_name_count_to_use_star_import = 2147483647` so IntelliJ's "Optimize Imports" never consolidates to `*`.

## Constructor injection only

```kotlin
@Service
class ForexService(private val client: ForexRateClient) { /* … */ }
```

No `@Autowired` on fields, no `lateinit var` for dependencies in `src/main`. `lateinit var` is fine in tests (`@Autowired lateinit var mvc: MockMvc`, `@MockitoBean lateinit var authService: AuthService`, a `MockWebServer` set up in `@BeforeEach`).

## Validation — `require` for input, `error` for impossibilities

```kotlin
// require → IllegalArgumentException → 400 via GlobalExceptionHandler (TradeEntryService)
require(bytes.size <= MAX_SCREENSHOT_BYTES) {
  "Screenshot exceeds the ${MAX_SCREENSHOT_BYTES / BYTES_PER_MB} MB limit"
}

// error → IllegalStateException for "this should never happen" (CustomOAuth2UserService)
val email = /* … */ ?: error("Google userinfo missing email claim — check requested scopes include 'email'")
```

- **`require`** is the input-validation tool (`AppConfigService.set`, `TradeEntryService.applyExecutions`, `TradePositionCalculator.compute`). The message becomes the 400 body — write it for a human, one `require` per precondition.
- **`error("…")`** is for broken invariants / upstream contract violations (missing OAuth claims, no authentication in `AuthService.getCurrentUser`). Rare by design.
- **`check`** — not used ; default to `require`.

Validate in the service (→ 400) before the DB, so a bad input never surfaces as a DB CHECK violation (→ 409).

## Null handling

- **`?.let { … }`** — "if non-null, do this". Canonical use: optional filters in `TradeEntrySpecifications.matching` (`filter.dateFrom?.let { from -> predicates += … }`), optional preferences in `AuthService`.
- **Elvis** for fallback (`overrides[key] ?: defaultFor(key)`) and for throw-on-null (`?: error("…")`, `?: throw UpstreamUnavailableException(…)`, `?: return`).
- **Avoid `!!`.** Prefer a smart-cast via a local `val` or an Elvis throw. (Two legacy `!!` remain in `TradeEntryService.attachScreenshot` after a `require(... in ALLOWED_IMAGE_TYPES)` — don't copy the pattern.)
- Don't mix up `?.also` (returns the receiver) and `?.let` (returns the lambda result).

## Constants

```kotlin
class TradeEntryService(/* … */) {
  companion object {
    private val DEFAULT_SORT: Sort = Sort.by(Sort.Order.desc("tradeDate"), Sort.Order.desc("createdAt"))
    private const val BYTES_PER_MB = 1024 * 1024
    private const val MAX_SCREENSHOT_BYTES = 5 * BYTES_PER_MB
  }
}
```

- Class-local thresholds: `private const val` in the class's `companion object`, not top-level.
- Stateless `object`s keep their constants in the object body (`TradePositionCalculator.PRICE_SCALE`, `StatMetrics.SCALE`).
- Shared keys gather in a dedicated `object` with public `const val` (`ConfigKeys.ALLOWED_EMAILS`, plus `KNOWN_KEYS` / `EMAIL_LIST_KEYS` sets).
- Column-index tables for CSV codecs live in a nested `private object Col` (`TradeEntryCsvDecoder`, `StatEntryCsvDecoder`).

## Extension functions — layer mappers only

```kotlin
// application/dto/AccountMovementDto.kt — next to the DTO it produces
fun AccountMovement.toDto(): AccountMovementDto = AccountMovementDto(id = id, type = type, /* … */)
```

The project's extensions are **domain → DTO mappers** declared in the DTO file: `TradeEntry.toDto()`, `TradeExecution.toDto()`, `AccountMovement.toDto()`, `StatEntry.toDto()`, `LexiconEntry.toDto()`, `User.toCurrentUserDto()`. Receiver is the *source* type ; extra inputs are explicit parameters.

Wire → domain mapping for an upstream is done inside the adapter (`FrankfurterForexClient` builds `ForexRate` from its private `FrankfurterLatestResponse`) ; extract a `toDomain()` extension only when it grows.

**Don't** create extensions for general-purpose utilities (`fun String.titleCase()`). Keep a helper `private` next to its only caller ; promote to `shared/` when a third caller appears. File-level `internal fun` is acceptable when a test needs the same helper (`parseEmailList` in `AppConfigService.kt`).

## Sealed vs enum — pick by data shape

- **Enum** — closed set, no per-branch payload. Every closed set in the codebase is an enum today: `TradeDirection`, `ExecutionKind`, `TradePlay`, `TradePattern`, `AccountMovementType`, `Role`, `TradePositionCalculator.PositionStatus`. Enums mirrored by a Postgres enum must keep **identical names** (mapped via `@JdbcTypeCode(NAMED_ENUM)`).
- **Sealed interface** — only when branches carry different data (`data object Ok` / `data class Invalid(val reason: String)`). None exists today ; don't reach for one if an enum fits.

`when` on an enum/sealed type **without** `else` keeps the compiler's exhaustiveness check — don't add a defensive `else -> throw`, it silences the warning when a constant is added.

## Kotlin vs JVM string methods

In regular code use Kotlin's `.uppercase()` / `.lowercase()` (locale-safe ; `ForexService`, `parseEmailList`). In **SpEL** strings (`@Cacheable(key = …)`, `@PreAuthorize`), only JVM methods resolve — `.toUpperCase()`, not `.uppercase()`. None in use today, but it's a silent runtime failure when it bites.

## Scope functions

- `?.let` — dominant, for null-safe blocks (see above).
- `.also` — side effect returning the receiver: `repository.findById(key).orElse(null)?.also { it.configValue = value }` (`AppConfigService.set`), `FilterRegistrationBean(filter).also { it.isEnabled = false }`.
- `.apply` — builder-style init on Java objects: `JdkClientHttpRequestFactory(httpClient).apply { setReadTimeout(…) }` (`ForexHttpConfig`).
- `run` / `with` — absent ; name an intermediate `val` instead.

Don't use a scope function just to save a line.

## Wire models

Jackson-bound classes mirroring an upstream payload are `data class`es (Jackson needs the canonical constructor), follow the upstream JSON names, declare only the fields actually read, and stay `private` to the adapter file when nothing else needs them (`FrankfurterLatestResponse`).

## Comments — the strict minimum

See [`CLAUDE.md > Comments`](../../CLAUDE.md#comments--the-strict-minimum). A KDoc is worth its
lines when it tells a caller what they can't read off the signature: the invariant, the failure
mode, the reason the obvious alternative was rejected. Not the mechanics, not the history.

```kotlin
// ✗ narrates the code and its past
/**
 * Loads the trade. Added in Phase 4. First we fetch it from the repository, then we check the
 * owner, then we map it to a DTO.
 */

// ✓ says what the caller can't guess
/** Foreign or missing id → 404 (never 403) so we don't leak the existence of someone else's row. */
```
