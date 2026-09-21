---
name: css
description: Styling conventions for the PortfolioAI frontend — where a style lives (lib global partial, Material override, page SCSS), the design tokens (colours, radii, shadows as CSS custom properties ; spacing, type and icon sizes as SCSS variables), restyling Material through its override mixins, specificity against Material's runtime styles, the shared page patterns (`.page`, `.card`, banners, states) and how blocks are spaced. Use when writing or reviewing any `.scss`, adding a shared class, resizing text / icons / paddings, or reaching for `::ng-deep`.
---

# CSS — PortfolioAI frontend

Two places hold styles : **`libs/ui`** (the design system — tokens, Material overrides, the shared
page patterns) and the **page SCSS** of `apps/web` (only what is genuinely that page's). Epic #257
moves the patterns the pages had copied into the lib ; follow its end state, not the leftovers.

## Where a style goes

| What | Where |
| --- | --- |
| Restyling a Material component | `libs/ui/src/lib/<name>/<name>.scss`, through `mat.<name>-overrides(...)` — see the [`material-overrides`](../material-overrides/SKILL.md) skill |
| A variant of a Material component (size, tone…) | a `Stb*` directive posting a class, the rules next to the overrides (`stbSize`, `stbTone`, `stbCol`, `stbChip`) |
| A pattern two pages share (card, banner, KPI row, filter toolbar…) | a global partial in `libs/ui/styles/components/`, forwarded by `styles/index.scss` |
| A token (colour, radius, size) | `libs/ui/styles/_tokens.scss` (theme-varying) or `_sizes.scss` (sizes) |
| The arrangement of one page | its own SCSS — grids, columns, what only that page has |

A page never redeclares a lib class. If the lib's version doesn't fit, change the lib (every page
benefits) or give the page its own, differently-named class.

`libs/ui` stays presentational : no i18n, no DI. A shared *class* is the cheapest reuse ; a shared
component only when markup must be shared too (texts arrive translated).

## Tokens

**Colours, radii, shadows — CSS custom properties** (`_tokens.scss`), because they change with the
theme : `--color-*` (+ `-soft` variants), `--radius-sm | --radius | --radius-lg | --radius-pill`,
`--shadow-sm | --shadow`. Never a hex / `oklch()` outside `_tokens.scss`.

The **colour rule** : green / red (`--color-success` / `--color-danger`) for outcomes (P&L, amounts,
gaps), amber (`--color-warning`) for warnings, indigo (`--color-accent`) for statuses and
categories, neutral for everything else — one status exception, the green check of a completed
stat.

**Sizes — SCSS variables** (`_sizes.scss`), resolved at compile time. Import them in any page or
lib SCSS :

```scss
@use 'sizes' as s; // `libs/ui/styles` is on the app's include path (angular.json)

.thing {
  padding: s.$space-md s.$space-lg;
  font-size: s.$font-xs;
  gap: s.$space-sm;
}
```

| Scale | Steps |
| --- | --- |
| Spacing `$space-*` | `hairline` 2 · `xs` 4 · `sm` 8 · `md` 12 · `lg` 16 · `xl` 24 · `2xl` 32 · `3xl` 48 |
| Type `$font-*` | `2xs` 11 · `xs` 12 · `sm` 13 · `md` 14 · `lg` 16 · `xl` 18 · `2xl` 24 · `3xl` 32 |
| Icons `$icon-*` | `xs` 14 · `sm` 16 · `md` 18 · `lg` 24 · `xl` 40 — font-size, width and height together |
| Component sizes | `$button-height`, `$icon-button-size`, `$card-padding-y` / `-x`, `$toolbar-height`, `$sidenav-width` |

**No raw size.** A padding, margin, gap, font-size or icon size is a token. A value off the scale
is snapped to the nearest step ; if it is genuinely a component's own dimension, it becomes a named
component size in `_sizes.scss`. Left raw on purpose : `1px` borders / hairlines, media-query
breakpoints, and values that are Material's own dimensions.

Pixels, not `rem` : the app is dense and the type steps are one pixel apart.

## Restyling Material

- **Through the override mixins, never by hand-writing Material's CSS variables.** Material renamed
  its `--mdc-*` variables to `--mat-*` ; the hand-written ones kept compiling and silently stopped
  working (#269). The mixin emits whatever name Material reads — scope it to a selector when the
  change is conditional :

  ```scss
  .mat-mdc-icon-button:not(:disabled):hover {
    @include mat.icon-button-overrides((icon-color: var(--color-text)));
  }
  ```

- **No `::ng-deep`.** It reaches into a Material internal from outside the component. Use the
  component's token ; if none exists, put the rule in the lib (where it breaks once, not per page)
  with a comment naming the missing token.
- **Density is a set, scoped by context.** A tighter field is `@include mat.form-field-density(-5)`
  on its container — the custom properties it emits reach every field inside. The `.toolbar` does
  exactly that instead of the old `.mat-mdc-form-field-infix` reach.

## Specificity and injection order

- **Material's component styles are injected at runtime, after the global sheet.** At equal
  specificity the lib loses to Material. #255 is the case : an accent bar on `::before` was taken
  over by Material's `.mdc-list-item:not(.--selected):focus::before` (0-3-1). Check a promoted rule
  against what Material ships, not only against the other pages.
- **A page's emulated styles beat the lib** : `.card[_ngcontent-…]` is (0,2,0) against the lib's
  `.card` (0,1,0). That is how a page refines a lib class it owns a variant of — and why a page
  rule left behind keeps winning after the lib takes the pattern over.
- **A global class reaches nested components** — a lib rule like `.card h3` styles an `h3` rendered
  by a child component inside the card, which a page's emulated rule never did. Check the children.
- **Names collide across the global cascade.** Before promoting `.toolbar`, `.card`…, grep every
  template : an inert or differently-meant use of the same name picks the lib's rules up.

## Shared page patterns (in the lib)

| Class | Partial | For |
| --- | --- | --- |
| `.page` (+ `--full`) | `components/_page.scss` | the page container — every page is `page page--full` today |
| `.card`, `.card h3` / `.card-title`, `.hint` | `components/_card.scss` | a page section, its title row, the faint hint next to a title |
| `.kpi-row` > `.kpi` (`__label`, `__value`, `__sub`, `--hero`) | `components/_kpi.scss` | the figures on top of a page — tiles are `.card`s or `mat-card`s |
| `.toolbar` | `components/_toolbar.scss` | the filter row above a list ; its form fields are density `-5` (36 px) |
| `.form-stack` | `components/_form.scss` | a column of form fields (a dialog's `mat-dialog-content`) — fields reserve no subscript space, so they need it |
| `.error-banner`, `.info-banner`, `.warn-banner` | `components/_banners.scss` | page-level messages |
| `.loading-state`, `.empty-state` | `components/_banners.scss` | a list that loads or has nothing |

A `mat-card appearance="outlined"` is already restyled by the lib (surface, border, radius) : use
it when Material's card fits, `.card` otherwise, and give its heading `.card-title`.

## Spacing between blocks

**The page spaces its sections, the sections don't.** `.page` is a vertical stack (`gap:
$space-lg`) and drops the vertical margins of its direct children, so a card, a KPI row, a banner
or a toolbar is spaced the same on every page. The page header keeps 12 px of its own — 28 px under
a title in all. Inside a section, a grid or a flex container spaces its children with `gap` too.

So : no bottom margin on a lib block, no page cancelling one, and a new layout inside a section
uses `gap`, not sibling margins. (`components/page` is forwarded last so its child rule wins over
the blocks' own margins.)

## Before committing styles

- No new raw size, colour or `::ng-deep` ; no redeclared lib class.
- The pages touched re-checked in **both themes** (and a narrow width when a grid is involved) —
  the reviewer can't see the rendering, so list them in the PR.
