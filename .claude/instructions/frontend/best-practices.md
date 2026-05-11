# Frontend Best Practices

You are an expert in TypeScript and Angular 21+. Write functional, maintainable, performant and accessible code following Angular standalone-component patterns.

These rules apply to the single Angular app under `frontend/`.

## TypeScript

- Strict type checking is on — keep it that way
- Prefer type inference when the type is obvious
- Avoid `any`; use `unknown` when the type is genuinely uncertain
- Lean on `readonly`, discriminated unions and exhaustive `switch` on union types

## Angular

- Components are **standalone** by default — do not set `standalone: true` and do not declare them in NgModules
- Use **signal-based** inputs/outputs (`input()`, `output()`, `model()`) — not `@Input()` / `@Output()`
- Use the `host` object on `@Component` — not `@HostBinding` / `@HostListener`
- Use native control flow (`@if`, `@for`, `@switch`) — never `*ngIf`, `*ngFor`, `*ngSwitch`
- Use direct class/style bindings (`[class.x]`, `[style.color]`) — never `ngClass` / `ngStyle`
- Use `inject()` instead of constructor injection
- **Change detection** : the app runs in zoneless mode (`provideZonelessChangeDetection()` in `app.config.ts`), so `ChangeDetectionStrategy.OnPush` is not required — signals drive change detection manually, OnPush would be a no-op. Leave the default strategy on new components.

## State management

- Local component state: `signal()` / `computed()`
- Shared state: an `@Injectable({ providedIn: 'root' })` service exposing readonly signals
- Avoid `BehaviorSubject` for new code — use signals; keep RxJS for streams (HTTP, WebSocket, debounce)
- Never use `effect()` to derive state — use `computed()` instead

## Material

- Use Angular Material for UI primitives (buttons, dialogs, tables, form fields)
- Stay consistent with the existing components under `frontend/src/app/` (no custom UI lib)

## Accessibility

- MUST pass AXE checks
- MUST meet WCAG AA: focus management, color contrast, ARIA attributes, keyboard navigation

## Services & data access

- Single responsibility per service / repository
- Cross-feature data access uses **ports + HTTP adapters** under `frontend/src/app/core/` :
  - port = `core/<name>.repository.ts` (abstract class, doubles as DI token)
  - adapter = `core/adapters/<name>.http.ts` (`HttpXxxRepository`, `@Injectable()` without `providedIn`)
  - wired via `{ provide: XxxRepository, useClass: HttpXxxRepository }` in `app.config.ts`
- Components inject the **port** (the abstraction), never the HTTP adapter directly
- Pure use-case services (no HTTP, e.g. `ThemeService`) stay in `core/` with `providedIn: 'root'`
- See the `folders-structure-frontend` skill for the full folder convention

## Linting & formatting

- Code MUST be free of ESLint / Angular ESLint errors
- Formatting is enforced by Prettier — run `npm run format` from `frontend/`
- Pre-commit hook (Spotless + Prettier) runs on staged files; let it pass without `--no-verify`
