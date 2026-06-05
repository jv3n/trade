---
name: material-overrides
description: Convention for wrapping Angular Material modules in the PortfolioAI design-system lib (`libs/ui`) — `Stb<Name>Module` wrapper, exhaustive M3 token-override SCSS, optional design-system directives (`StbSize`, `StbCol`, `StbChip`…), Storybook playground. Use when adding a new wrapped Material primitive, adjusting an M3 token override, or designing a domain-specific variant on top of a Material component.
---

# Material Overrides — `libs/ui` Convention

Every Angular Material primitive used by `apps/web` is wrapped under `libs/ui/src/lib/<name>/` as a **`Stb<Name>Module`** that re-exports the Material module + ships an exhaustive Material 3 token-override SCSS. Consumer code imports the wrapper from `@portfolioai/ui`, never the raw `Mat<Name>Module`. This skill codifies what lives in each wrapper folder, how the M3 overrides are written, and how design-system directives extend the surface without forking Material.

## Why this convention exists

- **Single point of configuration** — `mat.<name>-overrides(...)` mixin called once, `:root`-scoped. Dark / light theme swap via `[data-theme='light']` cascades automatically through the `var(--color-…)` references.
- **Exhaustive documentation by code** — every M3 token (per `_m3-<name>.scss > get-tokens()`) is listed in the override file, with applied tokens carrying a value and deferred tokens commented in. Future contributors see at a glance what's still on the table without re-reading the Material source.
- **Theme + density consistency** — the lib owns the radius (6 px), spacing, type scale, and accent recipe (`--color-accent-soft` selected pill, `--color-accent-strong` selected text). No per-feature Material customisation drift.
- **Variant extension without forking** — domain-specific variants ride on standalone directives (`StbSize`, `StbChip`…) that post a class on the host. The Material primitive stays untouched ; the variant CSS scopes via the `.stb-<name>--<variant>` selector.

## Folder layout

```
libs/ui/src/lib/<name>/
├── <name>.module.ts          # StbXxxModule — re-exports MatXxxModule + directives
├── <name>.scss               # exhaustive `mat.<name>-overrides(...)` + selector-level tweaks
├── <name>.directives.ts      # OPTIONAL — design-system directives (size, variant, position)
├── <name>.stories.ts         # Storybook story — single `Default` with controls
├── <name>.mdx                # Storybook docs page
├── public-api.ts             # `export * from './<name>.module'` (+ directives + types)
└── index.ts                  # `export * from './public-api'; export * from './<name>.module'`
```

Folder name matches the Material module name minus the `Mat` / `Module` parts (`button`, `card`, `table`, `chips`, `snack-bar`, …). The `sort-header` folder is named after the visible directive `mat-sort-header`, not the umbrella `MatSortModule`.

## The Stb wrapper module

Minimal viable form :

```typescript
import { NgModule } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { StbSize, StbSpinnerEnd } from './button.directives';

/**
 * StbButtonModule — design-system wrapper around Material's [MatButtonModule], plus the
 * `[stbSize]` directive (xs / sm / md / lg) and `[stbSpinnerEnd]` (position a loading
 * spinner after the label).
 */
@NgModule({
  imports: [MatButtonModule, StbSize, StbSpinnerEnd],
  exports: [MatButtonModule, StbSize, StbSpinnerEnd],
})
export class StbButtonModule {}
```

Constructor injection only. The KDoc explains the intent + any design-system specifics ; consumers see this in IDE tooltips.

## The exhaustive M3 token override

The `<name>.scss` file is the largest artefact in a typical wrapper. Pattern :

```scss
// Material <name> design — exhaustive token override (Material 22 / M3 API).
//
// Reference : https://material.angular.dev/components/<name>/styling
// Source-of-truth for the available tokens :
//   node_modules/@angular/material/<name>/_m3-<name>.scss > get-tokens()
//
// <Short paragraph describing the design intent — what idle / hover / selected look like,
// which design tokens drive what, any caveat unique to this primitive.>

@use '@angular/material' as mat;
@use '../../../styles/sizes' as s;        // when SCSS sizes vars are needed

:root {
  @include mat.<name>-overrides(
    (
      // ============================================================================
      // <Section name — e.g. Base, Color — idle, Color — selected, Typography, Density>
      // ============================================================================
      <token-1>: <value-1>,
      <token-2>: <value-2>,
      // <token-deferred-1>: <m3-default>,    // <one-line rationale>
      // <token-deferred-2>: <m3-default>,

      // ============================================================================
      // <Next section>
      // ============================================================================
      <token-N>: <value-N>,
      // <token-deferred-N>: <m3-default>,    // <rationale>
    )
  );
}

// ============================================================================
// Selector-level tweaks — things the token API doesn't expose.
// ============================================================================
.<some-class> {
  // <hairline border, hover background tweak, etc.>
}
```

### Process to write a new override

1. **Read the M3 source** : `node_modules/@angular/material/<name>/_m3-<name>.scss > get-tokens()`. Note every token name (drop the `<name>-` prefix when the mixin is `mat.<name>-overrides`).
2. **Group by section** — `Base`, `Color — idle`, `Color — selected`, `Color — disabled`, `Typography`, `Density`. Each section in its own banner.
3. **Apply or comment** — every token shows up exactly once. If we override → key + value. If we keep the M3 default → commented line with a 1-line rationale (e.g. `// M3 default — already 1 px hairline.`).
4. **Forward the file** — append `@forward '../src/lib/<name>/<name>';` to `libs/ui/styles/index.scss`. The app consumes the aggregator via `@use 'libs/ui/styles' as ui;` in `apps/web/src/styles.scss`.

### When two token APIs apply

A few components (autocomplete, select) compose two override mixins because the panel and the rows live in separate token namespaces. `autocomplete.scss` calls both `mat.autocomplete-overrides(...)` (3 panel tokens) and `mat.option-overrides(...)` (10 row tokens), and the preamble names both sources. The option overrides apply to **every** `<mat-option>` in the app (autocomplete + select panels share that row contract) — flag this in the preamble so the next contributor doesn't duplicate.

## Design-system directives — `Stb<Variant>`

When a wrapped Material primitive needs lib-specific variants (size, semantic flavour, position…), they ship as standalone directives in `<name>.directives.ts`. Pattern :

```typescript
import { Directive, computed, input } from '@angular/core';

export type StbButtonSize = 'xs' | 'sm' | 'md' | 'lg';

/**
 * Adds a `stb-size--{xs|sm|md|lg}` class on a Material button host so the lib's
 * `button.scss` can swap the MDC container height + label font-size tokens for that size.
 */
@Directive({
  selector: `
    button[mat-button][stbSize], a[mat-button][stbSize],
    button[mat-flat-button][stbSize], a[mat-flat-button][stbSize],
    button[mat-stroked-button][stbSize], a[mat-stroked-button][stbSize],
    button[mat-raised-button][stbSize], a[mat-raised-button][stbSize],
    button[mat-icon-button][stbSize], a[mat-icon-button][stbSize],
    button[mat-fab][stbSize], button[mat-mini-fab][stbSize]
  `,
  standalone: true,
  host: { '[class]': 'hostClass()' },
})
export class StbSize {
  readonly stbSize = input.required<StbButtonSize>();
  protected readonly hostClass = computed(() => `stb-size--${this.stbSize()}`);
}
```

### Rules

- Selector prefix : **`stb`** (per the ESLint config rule `@angular-eslint/directive-selector { type: 'attribute', prefix: ['ui', 'stb'] }`).
- Input name matches the selector property — `stbSize` not `size` — to satisfy `@angular-eslint/no-input-rename` without an `{ alias }` (which the rule bans).
- The directive **only** posts a class. The styling lives in the SCSS, scoped by `.stb-<name>--<variant>`. This keeps the directive small + trivially testable + the variant CSS greppable from the SCSS file.
- Variants list the supported tokens in a `StbXxxVariant` exported type (`'numeric' | 'mono' | 'actions'` for `StbCol`, `'ticker'` for `StbChip`). Adding a variant = extending the union + adding a `.stb-<name>--<new>` block in the SCSS.

### Existing examples

| Directive       | Selector(s)                                | Posts class                          | Lives in        |
| --------------- | ------------------------------------------ | ------------------------------------ | --------------- |
| `StbSize`       | `[stbSize]` on every Material button       | `.stb-size--{xs\|sm\|md\|lg}`         | `button/`       |
| `StbSpinnerEnd` | `mat-spinner[stbSpinnerEnd]`               | `.stb-spinner-end`                    | `button/`       |
| `StbTable`      | `div[stbTable]`                            | `.stb-table`                          | `table/`        |
| `StbCol`        | `th[stbCol], td[stbCol]`                   | `.stb-col--{numeric\|mono\|actions}`  | `table/`        |
| `StbChip`       | `mat-chip[stbChip], mat-chip-option[stbChip]` | `.stb-chip--{ticker}`              | `chips/`        |

## Snackbar variants

`MatSnackBar` is opened imperatively via the service — there's no template selector. The lib ships two semantic variants you opt into via the `panelClass` option of `MatSnackBar.open()` :

- **`stb-snack-bar--success`** — green container + duration 3 s for confirmations.
- **`stb-snack-bar--error`** — red container + duration 5 s for failures.

The variant CSS lives at the end of `libs/ui/src/lib/snack-bar/snack-bar.scss` and overrides the `--mat-snack-bar-container-color`, `--mat-snack-bar-supporting-text-color`, `--mat-snack-bar-button-color` CSS vars on the panel host. Uses the design-system semantic tokens `--color-success` / `--color-on-success` / `--color-danger` / `--color-on-danger`.

### Call-site helper

Features that emit several toasts factor a private `toast()` helper rather than repeating the snackbar call shape :

```typescript
private toast(
  key: string,
  variant: 'success' | 'error',
  params?: Record<string, unknown>,
): void {
  this.snackBar.open(this.translate.instant(key, params), undefined, {
    duration: variant === 'success' ? 3000 : 5000,
    panelClass: `stb-snack-bar--${variant}`,
  });
}
```

Call sites read `this.toast('journal.snackbar.deleteSuccess', 'success', { ticker })`. Verbatim in `JournalPage` + `JournalIoPage`.

## Storybook

One project per lib (`ui` in `angular.json`). Story titles : `Components/<Name>`.

**One playground story per component**, not many small stories. The user explicitly asked for a single `Default` story with the Storybook **Controls** panel driving every relevant input. `<Source>` snippets and comparison tables live in the `.mdx` doc, not in additional stories.

The toolbar global type `theme` (`dark` / `light`) toggles `document.documentElement.dataset.theme` via the `withDataTheme` decorator (see `.storybook/preview.ts`). The canvas background follows the theme via `libs/ui/.storybook/sb.css` so the dark / light comparison is one toolbar click away.

## When NOT to add a wrapper

- **Pure Material directive with no design-system surface** — if the wrapper would just re-export `MatXxxModule` with nothing else (no token override, no directive), skip it ; the app can import `MatXxxModule` directly until a real customisation appears. Today every Material module the app uses has either token overrides or a directive justifying the wrapper.
- **Components Material doesn't ship** — domain widgets (e.g. a CSV drop-zone) live in `apps/web/src/app/features/<name>/` or `apps/web/src/app/shared/`, not in `libs/ui`. `libs/ui` is specifically the Material-wrapping layer.
