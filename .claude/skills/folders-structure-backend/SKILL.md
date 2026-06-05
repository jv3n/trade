---
name: folders-structure-backend
description: Folder conventions for the PortfolioAI backend (Kotlin + Spring Boot under `backend/`). Use when creating a new module, port, adapter, controller, repository, or DTO — or when reviewing where a new backend file should live.
---

# Backend Folder Structure

A **single Spring Boot module** organised by **bounded context**. Each top-level package under `com.portfolioai/` is one context with the same `domain/` → `application/` → `infrastructure/` hexagonal split inside.

**No top-level `domain/`, `application/`, or `infrastructure/` package.** The split is *inside* each context, not above it.

**Post-pivot live contexts** : `journal/` (the main module — CRUD over trade entries + CSV export/import + Pageable listing) + `auth/` (always-live). **Dormant pre-pivot contexts** kept in the tree until phase 2 enrichment kicks in : `market/`, `analysis/`, `portfolio/`, `news/`, `analyst/`, `earnings/`, `screener/`, `watchlist/`, `config/`. They still compile and pass their tests ; nothing routes to them from the live UI today.

```
backend/
├── build.gradle.kts
├── src/main/
│   ├── resources/
│   │   ├── application.yml
│   │   ├── application-local.yml              # committed — no secrets
│   │   └── db/migration/V*.sql                # Flyway, append-only
│   └── kotlin/com/portfolioai/
│       ├── BackendApplication.kt
│       ├── shared/                            # cross-cutting beans + exceptions (GlobalExceptionHandler, UpstreamUnavailableException)
│       ├── auth/                              # OAuth2/OIDC + ADMIN/USER roles + local-no-auth
│       ├── journal/                           # ← PRIMARY post-pivot module
│       │   ├── domain/                        # TradeEntry, TradePlay, TradePattern, TradeStatus, TradeEntryFilter
│       │   ├── application/                   # TradeEntryService + TradeEntryCsvEncoder + TradeEntryCsvDecoder
│       │   │   └── dto/                       # TradeEntryDto, TradeEntryRequest, ImportResult
│       │   └── infrastructure/
│       │       ├── http/TradeEntryController.kt
│       │       └── persistence/{TradeEntryRepository,TradeEntrySpecifications}.kt
│       └── <dormant pre-pivot>/               # market/, analysis/, portfolio/, news/, analyst/,
│                                                # earnings/, screener/, watchlist/, config/
│           ├── domain/                        # pure Kotlin — no Spring, no Jackson, no JPA
│           │   ├── <Aggregate>.kt
│           │   ├── <ValueObject>.kt
│           │   ├── <Capability>Client.kt      # PORT — outbound port for the application
│           │   └── <DomainException>.kt
│           ├── application/                   # Spring services orchestrating the domain
│           │   ├── <UseCase>Service.kt        # @Service, constructor injection only
│           │   ├── <Helper>.kt                # Parser, Validator, Recorder…
│           │   └── dto/<Name>Dto.kt           # HTTP-facing DTOs
│           └── infrastructure/                # adapters — Spring details, HTTP, persistence
│               ├── http/<Name>Controller.kt
│               ├── persistence/
│               │   ├── <Aggregate>Repository.kt
│               │   └── <Name>Query.kt         # native SQL when @Query gets unwieldy
│               └── <capability>/              # when a port has ≥2 adapters
│                   ├── Finnhub<X>Client.kt    # real provider
│                   ├── Mock<X>Client.kt       # deterministic fallback
│                   ├── Routing<X>Client.kt    # @Primary — delegates per call
│                   ├── Finnhub<X>Models.kt    # wire DTOs (Jackson)
│                   └── Finnhub<X>Mappers.kt   # wire → domain
```

When in doubt about where a new file goes: **what product capability does it serve?** That answers the bounded context. Then the hexagonal split inside is mechanical.

## Conventions per layer

### `domain/`

- **Pure Kotlin only.** No Spring, no Jackson, no `@Component`. JPA `@Entity` lives here only when the aggregate is plain enough (cf. `TradeEntry.kt`, `WatchlistEntry.kt`) ; otherwise introduce a separate `<Name>Entity.kt` under `infrastructure/persistence/`.
- Aggregates, value objects, enums. Context-specific domain exceptions live here ; cross-context exceptions like `UpstreamUnavailableException` go in `shared/`.
- **Outbound ports** (`*Client.kt`, `*Classifier.kt`) live here. The domain owns the contract it depends on ; adapters realise it. Keep the port file pure : same no-Spring rule as the rest of `domain/`.
- Compilable in isolation — a domain test should not need Spring context.

### `application/`

- `@Service` beans, **constructor injection only** (no `@Autowired` field injection, no `lateinit var` on deps).
- Each service orchestrates one use case. Split into helpers (`TradeEntryCsvEncoder`, `TradeEntryCsvDecoder`) when a service exceeds ~200 lines.
- DTOs live in `application/dto/` — the contract between application and HTTP, not domain types.
- `@Async` methods on a **separate bean** from their caller (AOP proxy bypass otherwise — see `spring-boot` skill).
- For paginated listings : the **service owns the default sort**, not the controller's `@PageableDefault`. The controller declares only `@PageableDefault(size = N)` ; the service checks `pageable.sort.isUnsorted` and applies a `companion object` `DEFAULT_SORT` when true. See [`spring-boot > Pageable defaults`](../spring-boot/SKILL.md#pageable-defaults--sort-resolution).

### `infrastructure/`

- Everything Spring-coupled that isn't a `@Service`. Controllers, JPA repositories, REST clients, listeners, config beans.
- Three canonical subfolders : `http/` (controllers), `persistence/` (JPA + specifications + native queries), and optionally one per **external capability** (`news/`, `analyst/`, `earnings/`, `llm/`) when ≥2 adapters live there.
- **JPA Specifications** for dynamic filters : `<Aggregate>Specifications.kt` exposes a single `object` with a `matching(userId, filter)` builder that combines the user-scope predicate with every optional filter (see `TradeEntrySpecifications` for the canonical shape).
- Standalone listeners or one-off beans at the root of `infrastructure/` — promote to a subfolder only when a second file joins them.

## Port + adapter naming — verbatim

- **Port** — `<Capability>Client.kt`: `interface NewsClient`, `interface MarketChartClient`. In `<context>/domain/`. Pure Kotlin.
- **Real adapter** — `<Provider><Capability>Client.kt`: `FinnhubClient`, `TwelveDataClient`. One file per provider, in `infrastructure/<capability>/`.
- **Mock adapter** — `Mock<Capability>Client.kt`: `MockNewsClient`. Deterministic synthetic data, default when no API key.
- **Routing** — `Routing<Capability>Client.kt`: `RoutingNewsClient`, `@Primary`. Delegates each call to the adapter selected by `<context>.provider` in `AppConfigService`. **All adapters always instantiated** (no `@ConditionalOnProperty`).
- **Wire models / mappers** — `<Provider>Models.kt` + `<Provider>Mappers.kt`. Keep separate so a provider quirk doesn't leak into domain types.

## Tests

- Mirror the main package tree exactly. `journal/application/TradeEntryCsvDecoder.kt` → `journal/application/TradeEntryCsvDecoderTest.kt`.
- Domain tests sit under `<context>/domain/` even though there's no Spring — proximity beats grouping by test style.
- Integration tests on real PostgreSQL (no DB mocks). External providers mocked at the HTTP layer via `MockWebServer` (`okhttp3.mockwebserver`), not by stubbing the port — testing the adapter exercises the wire mapping too.

## Flyway

- Append-only: `V<N>__<short_snake_case>.sql`. Never rewrite a shipped migration ; add a new one.
- One numbered file per logical schema change. Don't batch unrelated changes.
- `repair-on-migrate` in `application-local.yml` only — never in `application.yml`.

## When NOT to use this layout

- **Don't** create a top-level `domain/`, `application/`, or `infrastructure/` package. Splitting by layer instead of by capability is a smell.
- **Don't** put DTOs in `infrastructure/http/`. They belong to `application/dto/`.
- **Don't** put JPA `@Entity` on domain types when it brings real friction. Either it's plain enough (most cases here, e.g. `TradeEntry`) or introduce a separate `<Name>Entity.kt` in `infrastructure/persistence/` — defer until JPA contamination becomes real friction.
- **Don't** anticipate a `<capability>/` subfolder under `infrastructure/` for a single adapter. Wait for the second.
