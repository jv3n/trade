---
name: kotlin-idioms
description: Opinionated Kotlin conventions for the PortfolioAI backend (Kotlin + Spring Boot). Use when writing or reviewing Kotlin code — imports, null handling, immutable types, validation, constants, extension functions, sealed/enum choice, scope functions. Skips general Kotlin tutorial content the model already knows.
---

# Kotlin Idioms

Project-specific Kotlin choices. Skips general language tutorial content — the model already knows `data class`, `?.`, `when`. This skill is for the calls *this project* makes when Kotlin offers two reasonable options, plus the few JVM/Spring gotchas that bite often enough to be worth pinning.

Formatter is **ktfmt Google style via Spotless** (`./gradlew spotlessApply`). Don't think about layout — write code and let the formatter normalise.

## Imports — no wildcards

**Always explicit imports, one symbol per line.** Even for the 6th `org.junit.jupiter.api.Assertions.*` member used in a test.

```kotlin
// CORRECT
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertThrows

// WRONG
import org.junit.jupiter.api.Assertions.*
```

Why : Spotless has a custom `no-wildcard-imports` check ; new wildcards break the build. IntelliJ's "Optimize Imports" *consolidates* into `*` past 5 imports of the same package — that default is wrong for this project. When editing, list each import on its own line. The Spotless allowlist in `backend/build.gradle.kts` covers historical idioms (`java.util.*`, JPA, MockMvc helpers, JUnit `Assertions.*`) but is being phased out (dette technique ticket "Shrink l'allowlist `no-wildcard-imports`"). **Don't add to it.**

## Constructor injection only

```kotlin
@Service
class NewsService(private val client: NewsClient) { /* … */ }
```

No `@Autowired` on fields. No `lateinit var` on dependencies. The `private val` constructor parameter is the only pattern — Spring resolves the bean by type, and the field is non-null and immutable. `grep -rn 'lateinit var' backend/src/main/` returns zero hits ; keep it that way.

`lateinit var` is occasionally legitimate in tests (`@BeforeEach` setup that initialises a `MockWebServer`), where the JUnit lifecycle owns the assignment.

## Validation — `require` for input, `error` for impossibilities

```kotlin
// require → IllegalArgumentException → 400 via GlobalExceptionHandler
fun setThumbs(snapshotId: Long, value: Int) {
  require(value in ALLOWED_THUMBS) { "thumbs value must be -1, 0, or 1 (got $value)" }
  /* … */
}

// error → IllegalStateException for "this should never happen"
val body = response.body ?: error("Empty response from Ollama")
```

**`require`** is the canonical input-validation tool. The thrown `IllegalArgumentException` is mapped to HTTP 400 by `GlobalExceptionHandler` with the lambda's message as the body — write the message as a user-readable explanation (`"version is required"`, not `"v cannot be empty"`). One `require` per precondition ; don't bundle.

**`error("…")`** is for impossible states (an upstream contract guarantees the value, but the API can return null at the type level). Rare. If you find yourself reaching for `error` more than once per file, the type design is probably wrong upstream.

**`check`** is the third option (precondition on internal state rather than parameters → `IllegalStateException`). Used very rarely in this project — when in doubt, default to `require`.

## Null handling — `?.let` for "do X only if not null"

```kotlin
quote.fiftyTwoWeekHigh?.let { lines += "52-week high: ${fmt(it)}" }
quote.currency?.let { lines += "Currency: $it" }
```

This is the project's central null-safe write idiom — it appears 50+ times in `TickerNarrativePrompt.kt` alone, conditionally building a prompt from nullable indicators. Use it whenever the goal is "if this value is non-null, run a small block with it".

**Don't** :
- `if (x != null) { use(x) }` — works, but smart-cast can fail across function calls. `?.let { use(it) }` is more robust and one line shorter.
- `x?.also { … }` when you want `let` semantics — `also` returns the receiver, `let` returns the lambda result. Mixing them up is a real footgun.
- `requireNotNull(x) { … }` for "do X if not null" — that's the opposite intent (throw if null). Use it when null is genuinely an error condition, not a skip.

For unwrapping with a fallback, the Elvis operator is fine : `val safe = nullable ?: default`. For unwrapping with a throw, prefer `?: error("…")` over `!!`. The bang operator (`!!`) should not appear in this codebase outside test fixtures.

## Constants — `private const val` in a `companion object`

```kotlin
class CoherenceScorer(/* … */) {
  /* … */
  companion object {
    private const val SCALE = 4
    private const val WEIGHT_SENTIMENT = 0.55
    private const val WEIGHT_KEYPOINTS = 0.30
    private const val WEIGHT_LENGTH = 0.15
  }
}
```

**Always inside `companion object`**, not top-level in the file. Top-level constants pollute the package namespace and break the "everything about this class is in this class" reading flow. `private const val` for module-local thresholds, `const val` (no `private`) only when the constant is genuinely exported (rare — `JobEventPublisher.SSE_EVENT_NAME`).

When constants are conceptually grouped (cache names, config keys), gather them in a dedicated `object` (`MarketConfig.NEWS_CACHE`, `ConfigKeys.NEWS_PROVIDER`). The pattern is "constants live in an object that names their group", never as bare top-level vals.

`const val` requires a compile-time-constant expression — strings, primitive numbers, booleans. For runtime-computed defaults (lists, regex), drop `const` and use `val` inside the companion object.

## Extension functions — `.toDto()` / `.toDomain()` mappers only

```kotlin
// CORRECT — extension function as cross-layer mapper
fun NewsItem.toDto() = NewsItemDto(symbol = symbol, headline = headline, /* … */)
fun FinnhubNewsItem.toDomain(symbol: String): NewsItem = NewsItem(/* … */)
```

The project's standard use of extension functions is **layer mappers** : wire → domain (`*Mappers.kt` in `infrastructure/<capability>/`) and domain → DTO (`*Dto.kt` in `application/dto/`). The receiver is always the *source* type ; the mapper is collocated with the *target* type's file. Mappers that need an extra parameter (the symbol on `FinnhubNewsItem.toDomain(symbol)`) take it explicitly — don't reach for `ThreadLocal` or context receivers.

**Don't** create extension functions for general-purpose utilities (`fun String.titleCase()`, `fun List<T>.second()`). The temptation is real, but the project keeps utilities inside their consumer (`private fun titleCase(s: String)` next to the only caller) rather than scattering ad-hoc extensions. Helpers earn promotion to `shared/` only when a third caller appears.

## Data classes vs `class`

- **`data class`** when the type's purpose is to carry values : domain aggregates, DTOs, wire models, value objects. Default choice.
- **`class`** when the type carries behaviour and identity isn't structural : Spring `@Service` beans, repositories, listeners.

Data classes get `equals`, `hashCode`, `toString`, `copy`, destructuring for free — use them. If a domain type doesn't have a sensible `equals` (e.g. it represents an external entity with an opaque server-side identity), that's a design hint, not a reason to drop `data` — surface the identity field explicitly.

Don't use `data class` for types you don't intend to compare or copy — the generated methods aren't free at the call site if they hide behaviour mismatches.

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

**Enum** when every branch is just a name. **Sealed** when branches need distinct fields. The project has many enums and exactly one `sealed interface` today (`NarrativeValidationResult`) — that ratio is informative : reach for sealed only when an enum genuinely can't carry the shape you need.

For exhaustiveness, `when` on a sealed type or enum **without** an `else` branch makes the compiler complain when a new branch is added — that's the safety net. Don't add `else -> throw IllegalStateException(…)` defensively ; it silences the compiler check and hides the next branch addition.

## The SpEL `.toUpperCase()` gotcha

```kotlin
@Cacheable(NEWS_CACHE, key = "#symbol.toUpperCase() + '|' + #limit")
fun forSymbol(symbol: String, limit: Int = 10) = client.fetchNews(symbol, limit)
```

In SpEL expressions (`@Cacheable.key`, `@PreAuthorize`, etc.), call **`.toUpperCase()`** (the JVM `java.lang.String` method) and **not `.uppercase()`** (the Kotlin stdlib extension). SpEL only sees the JVM type and can't resolve Kotlin extensions — the cache key silently becomes a runtime error.

For non-SpEL Kotlin code, prefer `.uppercase()` (the extension is locale-safe ; `.toUpperCase()` without a `Locale` is deprecated). The rule is "SpEL → Java method, regular code → Kotlin extension".

## Scope functions — `let` / `also` / `apply` / `run` / `with`

In this codebase `?.let` dominates (50+ uses) for null-safe transformation ; `.apply` appears occasionally for builder-style initialisation. The others are rare. **Don't reach for a scope function to save one line** — `val result = compute(x).let { transform(it) }` is harder to read than `val temp = compute(x); val result = transform(temp)`. Use scope functions when they make intent clearer, not as a code golf reflex.

Project convention :
- `?.let { … }` — "do X only if not null". Default for nullable transformations.
- `.also { … }` — side effect on the receiver, returning the receiver. Used for logging or registration : `entity.also { repo.save(it) }`.
- `.apply { … }` — builder-style mutation, returning the receiver. Mostly seen for Java interop (`MockHttpServletRequestBuilder.apply { … }`).
- `.run`, `with` — almost absent. If you find yourself reaching for them, prefer naming the intermediate value with `val`.

## Async — `@Async`, not coroutines (yet)

The project uses Spring's `@Async` for fire-and-forget work (LLM narrative pipeline). Coroutines are not on the stack today. When you add an async operation :

- `@Async` must live on a **separate bean** from its caller — `this.asyncMethod()` bypasses the Spring AOP proxy and runs synchronously.
- The method must return `Unit` or `CompletableFuture<T>`, not `T` directly.
- See [`spring-boot`](../spring-boot/SKILL.md) for the full proxy/AOP rules.

If a future feature pulls coroutines in (`spring-boot-starter-webflux`, `kotlinx-coroutines-reactor`), that's a stack decision worth its own ADR — don't sneak `runBlocking` or `GlobalScope.launch` into a current `@Async` service to avoid the configuration.

## When NOT to follow these patterns

- **Test fixtures and helpers** — looser rules. `lateinit var` for `@BeforeEach`-initialised state is fine. Wildcard imports of `Assertions.*` and `MockMvcRequestBuilders.*` are in the allowlist. Magic numbers in fixtures (`price = 123.45`) need no constant.
- **Generated code** (Flyway migrations don't apply ; this skill is for `.kt` files only).
- **External-API wire models** — Jackson-bound DTOs that mirror an upstream schema. Field names follow the upstream JSON (`snake_case` allowed), `data class` is mandatory (Jackson uses the canonical constructor), and the file may grow to 200 lines of fields without being a smell.
