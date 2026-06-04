# @portfolioai/ui

Internal CSS-first design system for PortfolioAI. The lib ships the Material theme, design tokens, base resets, shared component patterns (banners, badges) and Material component overrides through `libs/ui/styles/`. No npm publish — the app consumes the SCSS via relative `@use`.

## Layout

```
libs/ui/
├── styles/                       # the actual design system
│   ├── index.scss                # aggregator — @forward everything
│   ├── _theme.scss               # Material theme setup (violet primary, cyan tertiary)
│   ├── _tokens.scss              # CSS custom properties (dark default + [data-theme='light'])
│   ├── _base.scss                # resets, html/body, transitions, sticky toolbar
│   ├── _scrollbars.scss          # webkit + firefox scrollbar
│   └── components/
│       ├── _banners.scss         # .error-banner, .info-banner, .loading-state, .empty-state, .content-header, .config-card
│       ├── _badges.scss          # .confidence-badge, .action-badge, .status-badge, .type-badge
│       ├── _buttons.scss         # Material button design (overrides --mdc-*-button CSS vars)
│       └── _autocomplete.scss    # .watchlist-autocomplete-panel, .benchmark-autocomplete-panel
├── src/
│   ├── public-api.ts             # empty — no TS surface yet (CSS-first)
│   └── stories/                  # Storybook stories that demo the SCSS in isolation
│       └── buttons.stories.ts
├── .storybook/                   # Storybook 10 (Angular + webpack builder)
└── ng-package.json               # ng-packagr build — kept for when typed components arrive
```

## Scripts

```bash
npm run storybook           # serve Storybook on http://localhost:6006
npm run storybook:build     # static export → dist/storybook
npm run ui:build            # ng-packagr build → dist/ui (no-op while lib is CSS-only)
npm run ui:lint             # eslint
```

The app consumes the lib via `frontend/apps/web/src/styles.scss`:

```scss
@use '../../../libs/ui/styles';
```

## Conventions

- **CSS-first**. Don't add TS wrappers for Material components — restyle them via the `--mdc-*` token overrides in `components/_buttons.scss` so every consumer in the app gets the new look on the next reload.
- **One source of truth for tokens**. Every colour, radius, shadow flows through a CSS custom property in `_tokens.scss`. Hard-coded hex anywhere outside `_tokens.scss` is a smell.
- **Storybook stories live in `src/stories/`**. Use template strings (`render: () => ({ template: '…' })`) — no Angular component required, the goal is to iterate on the SCSS visually.
- **Typed components arrive on demand**. When a UI pattern needs more than CSS (e.g. composite props, slot projection, signals), add it under `libs/ui/src/lib/<component>/` and export it from `public-api.ts`. Selector prefix `ui`.
