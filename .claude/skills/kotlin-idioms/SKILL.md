---
name: kotlin-idioms
description: Opinionated Kotlin conventions for the PortfolioAI backend (Kotlin + Spring Boot). Use when writing or reviewing Kotlin code — imports, null handling, immutable types, validation, constants, extension functions, sealed/enum choice, scope functions. Skips general Kotlin tutorial content the model already knows.
---

# Kotlin Idioms

Project-specific Kotlin choices. The model already knows `data class`, `?.`, `when` — this skill is the calls *this project* makes when Kotlin offers two reasonable options, plus the JVM/Spring gotchas worth pinning.

Formatter is **ktfmt Google style via Spotless** (`./gradlew spotlessApply`).

## Imports — no wildcards

**Always explicit, one symbol per line.** Even past 5 members.

```kotlin
// CORRECT
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull

// WRONG
import org.junit.jupiter.api.Assertions.*
```

Spotless has a `no-wildcard-imports` check that throws on **any** wildcard — no allowlist (dropped 2026-05-15, ticket #10). `.editorconfig` pins `ij_kotlin_name_count_to_use_star_import = Int.MAX_VALUE` so IntelliJ's "Optimize Imports" can't reintroduce wildcards spontaneously. If a wildcard sneaks back (non-conformant IDE), `⌘+⌥+O` expands it correctly.

## Constructor injection only

```kotlin
@Service
class NewsService(private val client: NewsClient) { /* … */ }
```

No `@Autowired` on fields. No `lateinit var` on dependencies. `grep -rn 'lateinit var' backend/src/main/` returns zero hits ; keep it that way. `lateinit var` is occasionally legitimate in tests (`@BeforeEach` initialising a `MockWebServer`).

## Validation — `require` for input, `error` for impossibilities

```kotlin
// require → IllegalArgumentException → 400 via GlobalExceptionHandler
fun setThumbs(snapshotId: Long, value: Int) {
  require(value in ALLOWED_THUMBS) { "thumbs value must be -1, 0, or 1 (got $value)" }
}

// error → IllegalStateException for "this should never happen"
val body = response.body ?: error("Empty response from Ollama")
```

**`require`** is the canonical input-validation tool. The message becomes the 400 response body — write user-readable explanations (`"version is required"`, not `"v cannot be empty"`). One `require` per precondition.

**`error("…")`** is for impossible states (upstream contract guarantees the value, but the API can return null at the type level). Rare — if you reach for it more than once per file, the type design upstream is probably wrong.

**`check`** (precondition on internal state → `IllegalStateException`) — used very rarely. Default to `require`.

## Null handling — `?.let`

```kotlin
quote.fiftyTwoWeekHigh?.let { lines += "52-week high: ${fmt(it)}" }
quote.currency?.let { lines += "Currency: $it" }
```

The project's central null-safe write idiom (50+ uses in `TickerNarrativePrompt.kt` alone, conditionally building a prompt from nullable indicators). Use it for "if non-null, run a small block with it".

**Don't:**
- `if (x != null) { use(x) }` — works, but smart-cast can fail across function calls. `?.let { use(it) }` is one line shorter and more robust.
- `x?.also { … }` when you want `let` semantics — `also` returns the receiver, `let` returns the lambda result. Mixing them up is a real footgun.

For unwrap-with-fallback, Elvis is fine: `val safe = nullable ?: default`. For unwrap-with-throw, prefer `?: error("…")` over `!!`. The bang operator should not appear outside test fixtures.

## Constants — `private const val` in a `companion object`

```kotlin
class CoherenceScorer {
  companion object {
    private const val SCALE = 4
    private const val WEIGHT_SENTIMENT = 0.55
    private const val WEIGHT_KEYPOINTS = 0.30
    private const val WEIGHT_LENGTH = 0.15
  }
}
```

**Always inside `companion object`**, not top-level. Top-level pollutes the package namespace and breaks the "everything about this class is in this class" flow. `private const val` for module-local thresholds, `const val` (no `private`) only when genuinely exported (rare).

Grouped constants (cache names, config keys) gather in a dedicated `object` (`MarketConfig.NEWS_CACHE`, `ConfigKeys.NEWS_PROVIDER`).

## Extension functions — `.toDto()` / `.toDomain()` mappers only

```kotlin
fun NewsItem.toDto() = NewsItemDto(symbol = symbol, headline = headline, /* … */)
fun FinnhubNewsItem.toDomain(symbol: String): NewsItem = NewsItem(/* … */)
```

The project's only use of extensions is **layer mappers**: wire → domain (`*Mappers.kt` in `infrastructure/<capability>/`) and domain → DTO (`*Dto.kt` in `application/dto/`). Receiver is always the *source* type. Mappers needing an extra param (`toDomain(symbol)`) take it explicitly — no `ThreadLocal` or context receivers.

**Don't** create extensions for general-purpose utilities (`fun String.titleCase()`). Keep utilities inside their consumer (`private fun titleCase(s: String)` next to the only caller). Helpers earn promotion to `shared/` only when a third caller appears.

## Sealed vs enum — pick by data shape

```kotlin
// Enum — closed set, no per-branch payload
enum class Sentiment { BEARISH, NEUTRAL, BULLISH }

// Sealed — closed set, each branch carries different data
sealed interface NarrativeValidationResult {
  data object Ok : NarrativeValidationResult
  data class Invalid(val reason: String) : NarrativeValidationResult
}
```

Many enums in the codebase, exactly one `sealed interface` today (`NarrativeValidationResult`) — reach for sealed only when an enum genuinely can't carry the shape you need.

For exhaustiveness, `when` on a sealed/enum **without** `else` makes the compiler complain when a new branch is added — that's the safety net. Don't add `else -> throw IllegalStateException(…)` defensively; it silences the compiler check.

## The SpEL `.toUpperCase()` gotcha

```kotlin
@Cacheable(NEWS_CACHE, key = "#symbol.toUpperCase() + '|' + #limit")
```

In SpEL (`@Cacheable.key`, `@PreAuthorize`, etc.), call **`.toUpperCase()`** (JVM `String` method), **not `.uppercase()`** (Kotlin extension). SpEL only sees the JVM type and can't resolve Kotlin extensions — the cache key silently becomes a runtime error.

For non-SpEL Kotlin code, prefer `.uppercase()` (locale-safe; `.toUpperCase()` without a `Locale` is deprecated). Rule: **SpEL → Java method, regular code → Kotlin extension**.

## Scope functions

In this codebase `?.let` dominates (50+ uses) for null-safe transformation; `.apply` appears occasionally for builder-style init. Others are rare.

- `?.let { … }` — "do X only if not null". Default for nullable transformations.
- `.also { … }` — side effect on the receiver, returning the receiver. Used for logging or registration: `entity.also { repo.save(it) }`.
- `.apply { … }` — builder-style mutation. Mostly Java interop.
- `.run`, `with` — almost absent. Prefer naming an intermediate `val`.

Don't reach for a scope function to save one line — `val r = compute(x).let { transform(it) }` is harder to read than two lines.

## Wire models — looser rules

Jackson-bound DTOs that mirror an upstream schema follow the upstream JSON (`snake_case` allowed), `data class` is mandatory (Jackson uses the canonical constructor), and the file may grow to 200 lines of fields without being a smell.
