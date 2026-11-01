---
name: material-overrides
description: Conventions of the PortfolioAI design-system lib (`libs/ui`, `@portfolioai/ui`) — wrapping a Material module as `Stb<Name>Module`, exhaustive M3 token-override SCSS, `Stb*` directives, the lib's own components (charts, skeleton, `StbConfirm`, `StbToast`), Storybook. Use when adding or changing anything under `libs/ui/src/lib`, adjusting an M3 token, designing a variant on a Material component, or reaching for a chart, a skeleton or a confirmation modal.
---

# The `libs/ui` lib

Every Angular Material primitive the app uses is wrapped under `libs/ui/src/lib/<name>/` as a **`Stb<Name>Module`** that re-exports the Material module and ships an exhaustive Material 3 token-override SCSS. Beside the wrappers, the lib owns the presentational components Material doesn't ship. It stays presentational : no i18n, texts arrive translated.

Why : one place per Material customisation (`mat.<name>-overrides(...)`, `:root`-scoped, theme swap through the `var(--color-…)` references), every token visible in the override file, and variants that ride on directives instead of forking Material. The tokens and theme are in `styles/_tokens.scss` and `styles/_theme.scss` : see [`css`](../css/SKILL.md).

## Folder layout

```
libs/ui/src/lib/<name>/
├── <name>.module.ts          # StbXxxModule — re-exports MatXxxModule + directives
├── <name>.scss               # exhaustive `mat.<name>-overrides(...)` + selector-level tweaks
├── <name>.directives.ts      # OPTIONAL — design-system directives
├── <name>.stories.ts         # Storybook stories
├── <name>.mdx                # Storybook docs page
├── public-api.ts             # exports the module, directives, types, re-exported Material symbols
└── index.ts                  # `export * from './public-api'`
```

The folder is named after the Material module without `Mat` / `Module` (`button`, `chips`, `snack-bar`) ; `sort-header` after the visible directive `mat-sort-header`.

## The Stb wrapper module

```typescript
/**
 * StbButtonModule — design-system wrapper around Material's [MatButtonModule], plus the
 * `[stbSize]`, `[stbTone]` and `[stbDanger]` directives.
 */
@NgModule({
  imports: [MatButtonModule, StbDanger, StbSize, StbTone],
  exports: [MatButtonModule, StbDanger, StbSize, StbTone],
})
export class StbButtonModule {}
```

## Everything Material goes through the lib

`apps/web` never imports `@angular/material/*`, specs included : `no-restricted-imports` fails the lint. What the app needs besides the modules is re-exported by the wrapper that owns it (`dialog/public-api.ts` : `MatDialog`, `MAT_DIALOG_DATA`, `MATERIAL_ANIMATIONS`…). A missing one is added to its wrapper's `public-api.ts`.

The app-wide Material defaults are `provideStbMaterial()` (`src/lib/config/provide-stb-material.ts`) : a new default goes there.

## The exhaustive M3 token override

The `<name>.scss` file is the largest artefact in a wrapper :

```scss
// Material <name> design — exhaustive token override (Material 22 / M3 API).
//
// Source-of-truth for the available tokens :
//   node_modules/@angular/material/<name>/_m3-<name>.scss > get-tokens()
//
// <The design intent : idle / hover / selected, any caveat unique to this primitive.>

@use '@angular/material' as mat;
@use '../../../styles/sizes' as s;

:root {
  @include mat.<name>-overrides(
    (
      // ============================================================================
      // <Section — Base, Color — idle, Color — selected, Typography, Density>
      // ============================================================================
      <token-1>: <value-1>,
      // <token-deferred>: <m3-default>,    // <one-line rationale>
    )
  );
}

// Selector-level tweaks — what the token API doesn't expose.
```

### Process to write a new override

1. **Read the M3 source** : `node_modules/@angular/material/<name>/_m3-<name>.scss > get-tokens()`. Note every token name (drop the `<name>-` prefix when the mixin is `mat.<name>-overrides`).
2. **Group by section**, each in its own banner.
3. **Apply or comment** — every token shows up exactly once : key + value, or a commented line with a one-line rationale.
4. **Forward the file** — append `@forward '../src/lib/<name>/<name>';` to `libs/ui/styles/index.scss`, which `apps/web/src/styles.scss` consumes through `@use '../../../libs/ui/styles';`.

### When two token APIs apply

A component can compose two mixins when its panel and its rows live in separate namespaces : `select.scss` calls `mat.select-overrides(...)` and `mat.option-overrides(...)`. The option overrides apply to **every** `<mat-option>` in the app : say so in the preamble, and move them, never drop them, if that wrapper goes.

## Design-system directives — `Stb<Variant>`

Variants ship as standalone directives in `<name>.directives.ts`. Reference : `StbSize` in `button/button.directives.ts`.

```typescript
export type StbButtonSize = 'xs' | 'sm' | 'md' | 'lg';

@Directive({
  selector: `button[mat-button][stbSize], a[mat-button][stbSize] /* … each button kind */`,
  host: { '[class]': 'hostClass()' },
})
export class StbSize {
  readonly stbSize = input.required<StbButtonSize>();
  protected readonly hostClass = computed(() => `stb-size--${this.stbSize()}`);
}
```

- Selector prefix **`stb`** (`ui` for a component). The input is named like the selector : aliases are banned by `no-input-rename`.
- The directive posts a class ; the styling lives in the SCSS, scoped by `.stb-<name>--<variant>`, so it stays greppable. A directive may also carry the matching ARIA state (`StbTable` and `aria-busy`).
- The variants are an exported union type (`StbTableColVariant`, `StbChipVariant`). Adding one = extending the union + a block in the SCSS.

## The lib's own components

Same folder shape, with a `<name>.component.ts` or a service. Read their KDoc and stories :

- **Charts** (`chart/`) — `StbChart` (echarts host), `StbAreaChart`, `StbBarChart`, `StbCandleChart` (`ui-candle-chart` : bars, marks, legs, line, shades). `chart-theme.ts` resolves the palette tokens for the canvas, and redraws on a theme change.
- **Skeleton** (`skeleton/`) — `StbSkeleton` (`ui-skeleton`), the shared patterns, and `stbLoadGate` (see [`angular-signals`](../angular-signals/SKILL.md#loading-data--rxresource)).
- **`StbConfirm`** (`dialog/stb-confirm.ts`) — the confirmation modal : `open(data)` emits a boolean, `choose(data)` a `StbConfirmPick` when the modal carries a choice. The app goes through `ConfirmService.ask` / `.choose` (`core/app-state/`), which resolves the i18n texts.
- **Field reset** (`form-field/`) — the lib can't translate its ✕ button, so the app feeds `StbFormFieldResetIntl` at boot. That is the pattern for any lib text with no caller to pass it.

Domain widgets stay in the app, in `features/` or `shared/`.

## Snackbar variants

The snack bar is opened imperatively. The lib ships `stb-snack-bar--success` (3 s) and `stb-snack-bar--error` (5 s) at the end of `snack-bar/snack-bar.scss`.

### `StbToast` — the only entry point

`snack-bar/toast.service.ts` owns the panel classes and durations ; the app never injects `MatSnackBar`. The lib has no i18n, so the caller translates :

```typescript
this.toasts.success(this.translate.instant('journal.snackbar.deleteSuccess', { ticker }));
```

## Storybook

One project (`ui` in `angular.json`), `npm run storybook`. Titles : `Components/<Name>`, and `Components/Chart/<Kind>` for the charts. Prefer one `Default` playground whose Controls drive the inputs, with `<Source>` snippets in the `.mdx` ; add a story only for a state the Controls can't reach (the candle chart's two, the skeleton's patterns). The toolbar's `theme` global toggles `data-theme` through `withDataTheme` (`.storybook/preview.ts`).

## Comments — the strict minimum, with one exception

See [`CLAUDE.md > Comments`](../../CLAUDE.md#comments--the-strict-minimum) : everywhere else, a comment earns its line only by saying *why*.

**The token override files are the exception.** Listing every M3 token, applied or deferred with a one-line rationale, is the point of the file. Don't let the exception spread to the rest of the lib.
