---
name: kotlin-idioms
description: Opinionated Kotlin conventions for the PortfolioAI backend. Use when writing or reviewing Kotlin code — validation, null handling, constants, mappers, pure logic extraction, enums, scope functions. Skips general Kotlin tutorial content.
---

# Kotlin Idioms

The calls this project makes when Kotlin offers two reasonable options. Code lives under `projects/backend/src/main/kotlin/com/portfolioai/`.

## Tooling

- ktfmt Google style via Spotless (`./gradlew spotlessApply`), run by the pre-commit hook.
- **No wildcard imports** : a custom Spotless step fails on any `*`, with no allowlist, and `.editorconfig` stops IntelliJ from consolidating.
- Detekt reports but does not block (`ignoreFailures = true`) ; rules in `config/detekt/detekt.yml`.

## Injection

Constructor injection only. `@Autowired` and `lateinit var` are for tests.

## Validation

A refused input is a **`badRequest("…")`** (`shared/RequestValidation.kt`), written for a human, with `requirePositive` / `requireNonNegative` for amounts. Recent modules (`stats`, `scanner`, `daybars`, `locate`, `candidates`, `account`) use this only ; the `require` calls left in `journal` and `config` are older, and new code does not copy them.

- Validate in the service, before the database : a CHECK violation reads as a 409.
- A batch checks everything before keeping anything (`DayBarsService.check`).
- **`error("…")`** — a broken invariant or upstream contract (a missing OAuth claim). `check` / `checkNotNull` — what a guard or a constraint already ensures (`checkNotNull(row.bars)` on a `FOUND` day).

## Null handling

- `?.let` for "if non-null", typically optional filters (`filter.dateFrom?.let { … }`).
- Elvis for a fallback or a throw (`?: throw UpstreamUnavailableException(…)`).
- No `!!` in application code : a local `val` smart-casts, or an Elvis throws.

## Constants

- Class-local : `private companion object { const val … }`.
- A stateless `object` keeps them in its body (`StatMetrics.SCALE`).
- Shared keys go in a dedicated `object` (`ConfigKeys`).

## Mappers and extensions

- Domain → DTO : an extension in the DTO's file, the receiver being the source (`StatEntry.toDto()`), extra inputs explicit. The reverse too when a wire DTO becomes domain (`BarDto.toDomain()`).
- Upstream wire → domain : inside the adapter, the wire model `private` there.
- A rule applied to one type may be a file-level `internal` extension (`StatEntry.fillFrom` in `StatEntryRules.kt`).
- No general-purpose extension (`String.titleCase()`) : a `private` helper next to its caller, `shared/` from a third caller.

## Pure logic

Extract a computation from a large service into a file-level `internal fun` beside it, testable without Spring : `statSummaryOf` (`StatSummary.kt`), `journalSummaryOf` (`JournalSummary.kt`).

## Enums

Every closed set is an enum ; no sealed type exists, and one is only for branches carrying different data. Enums mirrored by Postgres keep identical names (see `spring-boot > Flyway`). A `when` on an enum has no `else`, which keeps the exhaustiveness check.

## Scope functions

`?.let` for null, `.also` for a side effect returning the receiver, `.apply` for builder-style setup on Java objects. No `run` / `with` : name a `val`. Don't use one just to save a line.

## Wire models

Jackson-bound `data class`es with the upstream's field names, only the fields read, `private` to the adapter file when nothing else needs them (`FrankfurterLatestResponse`).

## KDoc

[`CLAUDE.md > Comments`](../../CLAUDE.md#comments--the-strict-minimum) sets the bar : what a caller can't read off the signature.

```kotlin
/** Foreign or missing id → 404 (never 403) so we don't leak the existence of someone else's row. */
```
