---
name: folders-structure-backend
description: Folder conventions for the PortfolioAI backend (Kotlin + Spring Boot under `projects/backend/`). Use when creating a new module, port, adapter, controller, repository, or DTO — or when reviewing where a new backend file should live.
---

# Backend Folder Structure

A **single Spring Boot module** organised by **bounded context**. Each top-level package under `com.portfolioai/` is one context with the same `domain/` → `application/` → `infrastructure/` hexagonal split inside.

**No top-level `domain/`, `application/`, or `infrastructure/` package.** The split is *inside* each context, not above it.

Contexts: `journal/`, `account/`, `stats/`, `candidates/`, `lexicon/` (product) + `auth/`, `config/` (login whitelist `app.allowed.emails` via `AppConfigService`), `forex/` (FX rate for the account page) + `shared/`.

```
projects/backend/
├── build.gradle.kts
├── src/main/
│   ├── resources/
│   │   ├── application.yml
│   │   ├── application-local.yml             # committed — no secrets
│   │   ├── application-prod.yml              # committed — no secrets
│   │   └── db/migration/V<N>__*.sql          # Flyway, append-only
│   └── kotlin/com/portfolioai/
│       ├── BackendApplication.kt
│       ├── shared/                           # GlobalExceptionHandler, UpstreamUnavailableException, SpaFallbackConfig
│       ├── auth/                             # OAuth2/OIDC + roles + local-no-auth
│       │   └── infrastructure/security/      # extra adapter folder (Spring Security beans)
│       ├── journal/
│       │   ├── domain/                       # TradeEntry, TradeExecution, TradeAttachment, enums,
│       │   │                                 # TradeEntryFilter, TradePositionCalculator
│       │   ├── application/                  # TradeEntryService, TradeEntryCsvEncoder/Decoder,
│       │   │   │                             # TradeChangedEvent (published to account)
│       │   │   └── dto/                      # TradeEntryDto, TradeEntryRequest, ExecutionDto, ImportResult…
│       │   └── infrastructure/
│       │       ├── http/TradeEntryController.kt
│       │       └── persistence/              # TradeEntryRepository, TradeAttachmentRepository,
│       │                                     # TradeEntrySpecifications
│       ├── account/
│       │   ├── domain/                       # AccountMovement, AccountMovementType
│       │   ├── application/                  # AccountService, AccountTradeSyncService, AccountReconciler
│       │   │   └── dto/
│       │   └── infrastructure/
│       │       ├── TradeMovementSyncListener.kt   # standalone listener at the infrastructure root
│       │       ├── http/AccountController.kt
│       │       └── persistence/AccountMovementRepository.kt
│       ├── forex/                            # the only outbound external port
│       │   ├── domain/                       # ForexRate, ForexRateClient (PORT)
│       │   ├── application/                  # ForexService + dto/ForexRateDto
│       │   └── infrastructure/http/          # ForexController, ForexHttpConfig,
│       │                                     # FrankfurterForexClient (ADAPTER)
│       └── stats/, candidates/, lexicon/, config/   # same domain / application(+dto) /
│                                                    # infrastructure/{http,persistence} shape
```

When in doubt about where a new file goes: **what product capability does it serve?** That answers the bounded context. Then the split inside is mechanical.

## Conventions per layer

### `domain/`

- Aggregates, value objects, enums, pure domain logic (`TradePositionCalculator`, `StatMetrics`), filters (`TradeEntryFilter`), and **outbound ports** (`ForexRateClient`).
- No Spring, no Jackson, no `@Component`. JPA `@Entity` is tolerated on plain aggregates (`TradeEntry`, `AccountMovement`, `StatEntry`…) ; introduce a separate `<Name>Entity.kt` under `infrastructure/persistence/` only if JPA brings real friction.
- Ports stay pure interfaces — the domain owns the contract, the adapter realises it. See [`hexagonal-ddd`](../hexagonal-ddd/SKILL.md).
- Cross-context exceptions go to `shared/`, not here.

### `application/`

- `@Service` beans, **constructor injection only** (no `@Autowired` field, no `lateinit var` on deps).
- One service per use-case area. Split helpers out when a service grows past ~200 lines (`TradeEntryCsvEncoder` / `TradeEntryCsvDecoder`, `AccountReconciler`).
- Events published to other contexts live here (`journal/application/TradeChangedEvent.kt`) — they are the context's outward contract, like its services.
- DTOs in `application/dto/` — the contract between application and HTTP, not domain types.
- Paginated listings: the **service owns the default sort**. The controller declares only `@PageableDefault(size = N)` ; the service checks `pageable.sort.isUnsorted` and applies a `companion object` `DEFAULT_SORT` (`TradeEntryService`, `AccountService`, `StatEntryService`). See [`spring-boot > Pageable defaults`](../spring-boot/SKILL.md#pageable-defaults--sort-resolution).

### `infrastructure/`

- Everything Spring-coupled that isn't a `@Service`: controllers, JPA repositories, HTTP clients + their config, security beans, event listeners.
- Canonical subfolders: `http/` (controllers — and, in `forex/`, the outbound HTTP adapter + its `RestClient` config) and `persistence/` (JPA repositories + specifications). Add another only for a distinct technical concern with several files (`auth/infrastructure/security/`).
- **JPA Specifications** for dynamic filters: `<Aggregate>Specifications.kt` exposes an `object` with a `matching(userId, filter)` builder combining the user-scope predicate with every optional filter (`TradeEntrySpecifications`, `StatEntrySpecifications`).
- A lone listener or one-off bean sits at the root of `infrastructure/` (`account/infrastructure/TradeMovementSyncListener.kt`) — promote to a subfolder only when a second file joins it.

## Port + adapter naming

- **Port** — `<Capability>Client` in `<context>/domain/`: `ForexRateClient`.
- **Adapter** — `<Provider><Capability>Client` in `<context>/infrastructure/…`: `FrankfurterForexClient`.
- **Wire model** — Jackson DTO mirroring the provider JSON, kept `private` in the adapter file (`FrankfurterLatestResponse`) ; extract to `<Provider>Models.kt` only if it grows. Never exposed to `domain/`.
- **HTTP client bean** — `<Context>HttpConfig` with a named `RestClient` bean (`forexRestClient`, connect/read timeouts), injected with `@Qualifier`.

## Tests

- Mirror the main package tree: `journal/application/TradeEntryCsvDecoder.kt` → `journal/application/TradeEntryCsvDecoderTest.kt`, `journal/domain/TradePositionCalculator.kt` → `journal/domain/TradePositionCalculatorTest.kt`.
- Context-wide integration tests sit at the context root: `journal/JournalIntegrationTest.kt`, `account/AccountTradeSyncIntegrationTest.kt`.
- Integration tests on real PostgreSQL (Testcontainers singleton in `testsupport/`), no DB mocks.
- External APIs are faked at the HTTP layer with `MockWebServer` (`okhttp3.mockwebserver`), not by stubbing the port — `FrankfurterForexClientTest` exercises the wire mapping and error translation too.

## Flyway

- Append-only: `V<N>__<short_snake_case>.sql` (latest: `V11__drop_pre_pivot_tables.sql`). Never rewrite a shipped migration ; add a new one.
- One numbered file per logical schema change.
- `repair-on-migrate` in `application-local.yml` only — never in `application.yml`.

## Don't

- Create a top-level `domain/`, `application/`, or `infrastructure/` package — split by capability, not by layer.
- Put DTOs in `infrastructure/http/` — they belong to `application/dto/`.
- Add a port (interface) for an in-process collaborator or a JPA repository — ports are for external systems.
- Import another context's `infrastructure/` or wire model — go through its application service or an event.
