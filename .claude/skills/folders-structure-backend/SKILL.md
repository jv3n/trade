---
name: folders-structure-backend
description: Folder conventions for the PortfolioAI backend (Kotlin + Spring Boot under `backend/`). Use when creating a new module, port, adapter, controller, repository, or DTO — or when reviewing where a new backend file should live.
---

# Backend Folder Structure

PortfolioAI's backend is a **single Spring Boot module** organised by **bounded context**. Each top-level package under `com.portfolioai/` is one context (one product capability) and follows the same `domain/` → `application/` → `infrastructure/` hexagonal split.

There is **no top-level `domain/`, `application/`, or `infrastructure/` package**. The split is *inside* each context, not above it. This keeps related code colocated and makes "what does the `news` module own?" answerable by reading a single tree.

```
backend/
├── build.gradle.kts
├── src/main/
│   ├── resources/
│   │   ├── application.yml                    # default profile
│   │   ├── application-local.yml              # local profile (gitignored — API keys live here)
│   │   └── db/migration/V*.sql                # Flyway scripts, append-only
│   └── kotlin/com/portfolioai/
│       ├── BackendApplication.kt              # @SpringBootApplication entry point
│       ├── shared/                            # cross-cutting (today: GlobalExceptionHandler)
│       └── <bounded-context>/                 # one folder per context — 9 today
│           ├── domain/                        # pure Kotlin — no Spring, no Jackson, no JPA annotations
│           │   ├── <Aggregate>.kt             # data/sealed classes, value objects
│           │   ├── <ValueObject>.kt
│           │   └── <DomainException>.kt       # e.g. MarketUnavailableException
│           ├── application/                   # Spring services orchestrating the domain
│           │   ├── <UseCase>Service.kt        # @Service, constructor injection only
│           │   ├── <Helper>.kt                # supporting beans (Parser, Validator, Recorder…)
│           │   └── dto/                       # HTTP-facing DTOs (request + response)
│           │       └── <Name>Dto.kt
│           └── infrastructure/                # adapters — Spring details, HTTP, persistence
│               ├── http/                      # @RestController + URL routing
│               │   └── <Name>Controller.kt
│               ├── persistence/               # Spring Data JPA repositories + native queries
│               │   ├── <Aggregate>Repository.kt
│               │   └── <Name>Query.kt         # for native SQL (when @Query gets unwieldy)
│               └── <capability>/              # subfolder when a port has ≥3 adapters
│                   ├── <Capability>Client.kt  # PORT — interface
│                   ├── Finnhub<X>Client.kt    # ADAPTER — real provider
│                   ├── Mock<X>Client.kt       # ADAPTER — deterministic fallback
│                   ├── Routing<X>Client.kt    # @Primary — delegates per call to selected adapter
│                   ├── Finnhub<X>Models.kt    # wire DTOs (Jackson-bound, separate from domain)
│                   └── Finnhub<X>Mappers.kt   # wire → domain mappers
```

## Bounded contexts (9 today)

| Package         | Owns                                                       |
|-----------------|------------------------------------------------------------|
| `analysis/`     | Ticker narrative pipeline, LLM dispatch, prompt management, observability |
| `analyst/`      | Analyst recommendations + price targets (Finnhub)          |
| `config/`       | Runtime-editable settings (`app_config` table)             |
| `earnings/`     | Earnings history + next-date calendar (Finnhub)            |
| `market/`       | Market chart, indicators, sector benchmark, symbol search  |
| `news/`         | Per-ticker headlines (Finnhub)                             |
| `portfolio/`    | Wealthsimple CSV import, portfolios, historical snapshots  |
| `watchlist/`    | Manual ticker watchlist                                    |
| `shared/`       | Cross-cutting beans with no context home (rare)            |

When in doubt about where to place a new file: **what product capability does it serve?** That answers the bounded context. Then the hexagonal split inside is mechanical (pure Kotlin → `domain/`, Spring orchestration → `application/`, framework adapter → `infrastructure/`).

## Conventions

### `domain/`

- Pure Kotlin only. **No Spring**, no Jackson, no `@Entity`, no `@Component`.
- Aggregates, value objects, enums (`Sentiment`, `JobPhase`, `Timeframe`), domain exceptions (`MarketUnavailableException`).
- Compilable in isolation — a domain test should not need Spring context.
- Cross-context references are allowed but rare; if a context's domain depends on another, prefer passing the resolved value through the application layer.

### `application/`

- `@Service` beans, **constructor injection only** (no `@Autowired` field injection, no `lateinit var`).
- Each service orchestrates one use case (a method on `TickerService` corresponds to one HTTP endpoint's worth of logic). Split into helpers (`TickerNarrativeRunner`, `TickerNarrativeParser`, `PromptScoreRecorder`) when a service exceeds ~200 lines.
- DTOs live in `application/dto/` regardless of which layer consumes them. They are the contract carried between application and HTTP — not domain types.
- `@Async` methods must live on a **separate bean** from their caller (Spring AOP unwraps proxies; `this.async()` bypasses the proxy and runs synchronously).
- `@Cacheable` lives here in the service, not in the adapter — except where stated otherwise (see `market/` exception in `architecture.md`). Cache key is always `symbol.toUpperCase()` (Java's, not Kotlin's `.uppercase()` — SpEL targets the Java method).

### `infrastructure/`

- Everything Spring-coupled that isn't a `@Service`. Controllers, JPA repositories, RestTemplate-based clients, listeners (`OrphanedJobCleanupListener`, `CacheTtlListener`), config beans.
- Three canonical subfolders : `http/` (controllers), `persistence/` (JPA + native queries), and optionally one per **external capability** (`market/`, `news/`, `analyst/`, `earnings/`, `llm/`) when that capability has its own port + ≥2 adapters.
- The capability subfolder name mirrors the bounded context name when the context's *primary* port is external (`news/infrastructure/news/`, `analyst/infrastructure/analyst/`). For contexts with multiple capabilities (`market/` owns chart + sector + symbol search), each ships under the same `infrastructure/market/` umbrella because the wire models (`TwelveDataModels.kt`) are shared.
- Standalone listeners or one-off beans (`OrphanedJobCleanupListener`, `ConfigTestClient`) live at the root of `infrastructure/` — promote to a subfolder only once a second file joins them.

### Port + adapter naming

A bounded context that calls an external provider follows this naming pattern verbatim :

- **Port** — `<Capability>Client.kt` : `interface NewsClient`, `interface MarketChartClient`. Lives in `infrastructure/<capability>/` (the port is an infrastructure concern in this project — domain layer never sees provider abstractions).
- **Real adapter** — `<Provider><Capability>Client.kt` : `FinnhubClient`, `TwelveDataClient`, `FinnhubAnalystClient`. One file per provider.
- **Mock adapter** — `Mock<Capability>Client.kt` : `MockNewsClient`, `MockMarketChartClient`. Deterministic synthetic data, used as default when no API key is configured.
- **Routing** — `Routing<Capability>Client.kt` : `RoutingNewsClient`, annotated `@Primary`. Delegates each call to the adapter selected by `<context>.provider` in `AppConfigService`. **All adapters are always instantiated** (no `@ConditionalOnProperty`) so a runtime switch lands at the next call.
- **Wire models / mappers** — `<Provider>Models.kt` (Jackson-bound DTOs that mirror the provider's JSON exactly) + `<Provider>Mappers.kt` (`fun Foo.toDomain(): DomainFoo`). Keep them separate so a provider quirk doesn't leak into domain types.

### Tests

- Tests live under `src/test/kotlin/com/portfolioai/` and **mirror the main package tree** exactly. `analysis/application/TickerNarrativeParser.kt` → `analysis/application/TickerNarrativeParserTest.kt`.
- Domain tests sit under `<context>/domain/` even though there's no Spring there — proximity beats grouping by test style.
- Integration tests on real PostgreSQL (no DB mocks). External providers are mocked at the HTTP layer via `MockWebServer` (`okhttp3.mockwebserver`), not by stubbing the port — testing the adapter exercises the wire mapping too.

### Flyway

- Append-only : `V<N>__<short_snake_case>.sql`. Never rewrite a shipped migration ; add a new one.
- One numbered file per logical schema change. Don't batch unrelated changes into one V*.
- Flyway runs with `repair-on-migrate` in `application-local.yml` only — never in `application.yml`.

## When NOT to use this layout

- **Don't create a top-level `domain/`, `application/`, or `infrastructure/` package.** The split is per bounded context. A new global folder is almost always a sign you're splitting by layer instead of by capability.
- **Don't put DTOs in `infrastructure/http/`.** Controllers consume them, but they belong to `application/dto/` because the application layer produces and validates them.
- **Don't put JPA `@Entity` annotations on domain types.** If a domain class needs persistence, either (a) it's already plain enough that the JPA repository handles it (most cases here, e.g. `WatchlistEntry`), or (b) introduce a separate `<Name>Entity.kt` in `infrastructure/persistence/` with a mapper — but defer this until JPA contamination of domain becomes a real friction.
- **Don't create a `shared/` subfolder inside a bounded context.** Cross-context utilities go in top-level `shared/`. Intra-context helpers go next to their caller in `application/`.
- **Don't anticipate a `<capability>/` subfolder under `infrastructure/` for a single adapter.** Wait until a second adapter (mock or real) joins it — premature subfoldering buries one file.
