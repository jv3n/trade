---
name: folders-structure-backend
description: Folder conventions for the PortfolioAI backend (Kotlin + Spring Boot under `projects/backend/`). Use when creating a new module, port, adapter, controller, repository, or DTO — or when reviewing where a new backend file should live.
---

# Backend Folder Structure

A **single Spring Boot module** organised by **bounded context** : each top-level package under `com.portfolioai/` has its own `domain/` → `application/` → `infrastructure/` split. No top-level `domain/`, `application/` or `infrastructure/` package.

CLAUDE.md lists the contexts ; `ls` is the reference. To place a file, ask **which product capability it serves**, which gives the context, and the split inside is mechanical.

```
<context>/
├── domain/                     # entities, enums, pure logic, filters, ports
├── application/                # @Service, events, port implementers, pure summaries
│   └── dto/                    # requests and responses, mappers
└── infrastructure/
    ├── <Name>Listener.kt       # event listeners sit at the root
    ├── http/                   # controllers, request binders ; outbound HTTP adapter + its config
    ├── persistence/            # JPA repositories, Specifications, query classes
    └── security/               # only where a context has its own chain (auth, scanner)
```

**Flat exceptions, no layers** : `shared/` (see `hexagonal-ddd`), `devdata/` (`@Profile("local")` seed) and `e2e/` (`@Profile("e2e")`). These two last may import other contexts' `infrastructure/`, and only they may.

## `domain/`

- No Spring, no Jackson. JPA `@Entity` is tolerated on plain aggregates ; a separate entity class only if JPA brings real friction.
- Ports stay pure interfaces. See [`hexagonal-ddd`](../hexagonal-ddd/SKILL.md).

## `application/`

- One service per use-case area. A large service gets its pure computations extracted beside it (`StatSummary.kt`, `RuleScore.kt`) and its helpers into their own beans (`AccountReconciler`).
- Events published to other contexts live here (`TradeChangedEvent`) : they are the context's outward contract.
- A port another context owns is implemented here (`StatOfTheDayReader`).
- DTOs in `application/dto/`, never in `infrastructure/http/`. Exception : a binder that only reads URL parameters sits next to its controller (`StatListingQuery`).

## `infrastructure/`

- Add a subfolder only for a distinct technical concern with several files.
- **JPA Specifications** : `<Aggregate>Specifications.kt`, an `object` with a `matching(userId, filter)` builder combining the user scope with every optional filter.
- **HTTP client** : `<Context>HttpConfig` with a named `RestClient` bean and its timeouts, injected with `@Qualifier` (`ForexHttpConfig`).

## Tests

- Mirror the main tree (`stats/domain/StatMetrics.kt` → `stats/domain/StatMetricsTest.kt`).
- Context-wide integration tests sit at the context root (`daybars/DayBarsIntegrationTest.kt`).
- Migrations on data : `migration/MigrationsOnDataTest.kt`. Rest of the test strategy in [`spring-boot > Tests`](../spring-boot/SKILL.md#tests).
