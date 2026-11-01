---
name: angular-component
description: The shape of a component in the PortfolioAI frontend (Angular 22, standalone, zoneless) — file layout, imports, field order, host bindings. Use when creating a component or directive in `apps/web` or `libs/ui`. Signal I/O and state are in `angular-signals`, styling in `css`.
---

# Angular Component

Components are standalone by default : don't set `standalone: true`. The app is zoneless, so leave the default change-detection strategy : `OnPush` adds nothing.

## Shape

```typescript
// features/stats/stat-chart/stat-chart.ts
@Component({
  selector: 'app-stat-chart',
  imports: [StbCandleChart, StbButtonModule, TranslatePipe /* … only what the template uses */],
  templateUrl: './stat-chart.html',
  styleUrl: './stat-chart.scss',
})
export class StatChart {
  private readonly repo = inject(StatsRepository);
  private readonly card = viewChild.required<ElementRef<HTMLElement>>('card');

  /* then public `readonly` inputs and state, for the template */
}
```

- A page or dialog has `templateUrl` + `styleUrl`. An inline template is for a small part or a lib component.
- Private `readonly` injected fields first, then public `readonly` state : the template reads public members. `protected` is rare in the app.
- `imports` lists the `Stb*Module`s and `TranslatePipe`, never `CommonModule` nor a `Mat*Module`.
- Selectors : `app-*` in `apps/web`, `ui-*` for a lib component, `stb*` for a lib directive.
- `input()` / `output()` and the rest of signal I/O : [`angular-signals`](../angular-signals/SKILL.md#input--output--signal-based-io). No input or output aliases : the lint bans them.

## Host bindings — the `host` object only

Use the `host` object in the decorator, not `@HostBinding` / `@HostListener`.

```typescript
host: {
  '[class]': 'hostClass()',
  '[attr.aria-busy]': 'busy() || null',
  '(click)': 'onClick($event)',
}
```

Known exception : `shared/number-mask/number-mask.directive.ts` still uses `@HostListener`. Don't copy it.

## Rendering hooks

`afterNextRender` and `afterEveryRender` (`afterRender` no longer exists).

## Templates

`@if` / `@for` / `@switch`, `[class.x]` / `[style.x]`, no `ngClass` / `ngStyle`. Accessibility rules are in [`css > Accessibility`](../css/SKILL.md#accessibility).

## Comments

See [`CLAUDE.md > Comments`](../../CLAUDE.md#comments--the-strict-minimum). In a component, the class docstring earns its place when it says what the screen is for and where the data comes from ; inline comments only for a *why* the template can't show — a Material quirk worked around, an ordering that must hold, a binding that looks wrong and isn't.
