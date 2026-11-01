---
name: hexagonal-ddd
description: Hexagonal + DDD-tactical conventions for the PortfolioAI backend. Use when introducing a port and its adapter, calling an external API, designing upstream error handling (fail-hard vs fail-soft), breaking a dependency cycle between contexts, wiring a cross-context event, or deciding what belongs in `domain/` vs `application/` vs `infrastructure/`.
---

# Hexagonal + DDD Conventions

Bounded contexts at the top, three layers inside. Pair with [`folders-structure-backend`](../folders-structure-backend/SKILL.md) for *where* files go.

## Glossary

- **Bounded context** — a top-level package under `com.portfolioai/`, one product capability. `shared/` is not one.
- **Domain** — `<context>/domain/` : aggregates, enums, pure logic and ports. No Spring, no Jackson ; JPA `@Entity` is tolerated on plain aggregates.
- **Application service** — `@Service` under `<context>/application/`. Owns transactions, default sorts, event publishing.
- **Port** — an `interface` in `<context>/domain/`, owned by the context that needs it.
- **Adapter** — the class realising a port.
- **Wire model** — the Jackson DTO mirroring a provider's JSON, `private` in the adapter file, never in `domain/`.

JPA repositories are not ports : they stay in `infrastructure/persistence/` and services inject them directly.

## Two kinds of port

**Outbound, to an external system.** `ForexRateClient` in `forex/domain/`, `FrankfurterForexClient` in `forex/infrastructure/http/`. Named `<Capability>Client` / `<Provider><Capability>Client`. It hides URLs, JSON shapes and HTTP errors, and its adapter is tested with `MockWebServer`.

**Cycle-breaking, between two contexts.** A `fun interface` in the context that needs the data, implemented by a `<X>Reader` `@Service` in the provider's `application/` (`journal.domain.StatOfTheDay` by `stats.application.StatOfTheDayReader`, `stats.domain.CandidatePremarket` by `candidates.application.CandidatePremarketReader`). Its KDoc says why : "a port rather than a call to its service, which already depends on…".

No port otherwise : one adapter per port is the norm, with no router and no mock adapter, and an interface over an in-process collaborator nobody swaps is a tax.

## Cross-context dependencies

Contexts talk through application-layer types, never another context's adapter or wire model.

| Need | Use |
| ---- | --- |
| A read or a use case, no cycle | A direct call to the other context's application service |
| The same, but the reverse dependency exists | A `fun interface` port |
| A write-side effect the publisher shouldn't know about | An event |

Journal → account is the reference event : `TradeChangedEvent`, consumed in the same transaction, so `journal` doesn't know `account` exists (details in [`spring-boot > Events`](../spring-boot/SKILL.md#events)).

- **`auth/` is the identity context.** A request path goes through `AuthService`. A path with no session user injects `UserRepository` : the event-driven sync (`AccountTradeSyncService`, `AccountLocateSyncService`) and the scanner, whose owner comes from configuration (`ScannerService`).
- **`shared/`** holds what every context may import : exceptions, `Pattern`, `TradeDirection`, `PageResponse`, `RequestValidation`, `ClockConfig`.

## Inbound access

The session is the default. ts-scanner is the one non-session client, on `/api/scanner/**` with a bearer token and its own filter chain (`ScannerSecurityConfig`).

## Fail-hard vs fail-soft

Pick per call site and say so in the KDoc.

**Fail-hard — the call is required.** Translate every upstream failure into `UpstreamUnavailableException` (`shared/`), which `GlobalExceptionHandler` maps to a 503. `FrankfurterForexClient` is the reference. Never return a stale or invented value : a wrong CAD figure is worse than none. Degradation happens at the consumer, the page keeping the balance in USD on a 503.

**Fail-soft — optional enrichment.** Catch the *specific* expected exception, log `warn`, skip the field. Opt-in per call site, never a blanket `catch (e: Exception)`, which swallows your own bugs as an outage. If the feature breaks without the call, it is fail-hard. No call site needs it today.

## Caching an external call

Cache in the adapter where the upstream cost is : `FrankfurterForexClient` holds a standalone Caffeine cache (6 h). Never cache an error, and key on normalised inputs.

## Comments

A port's KDoc is the one place worth a few lines : it is the contract adapters and tests are written against — what the caller may assume, and what happens when the upstream is down.
