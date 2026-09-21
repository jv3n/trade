# @portfolioai/ui

Internal design system for PortfolioAI : the Material theme, the design tokens, the shared page
patterns and one wrapper per Material component the app uses (`Stb<Name>Module` + its token
overrides). No npm publish — the app imports the wrappers from `@portfolioai/ui` and loads the
styles through `styles/index.scss`.

## Layout

```
libs/ui/
├── styles/
│   ├── index.scss        # aggregator — @forward everything, the page partial last
│   ├── _theme.scss       # Material theme (mat.theme(), system colours mapped on the tokens)
│   ├── _tokens.scss      # CSS custom properties — colours, radii, shadows (dark + light)
│   ├── _sizes.scss       # SCSS scales — spacing, type, icons, component sizes
│   ├── _base.scss        # resets, html / body, focus ring
│   ├── _shell.scss       # the app shell (sidenav, top bar)
│   ├── _fonts.scss, _scrollbars.scss
│   └── components/       # shared page patterns, global classes
│       ├── _page.scss    # .page — the page stack
│       ├── _card.scss    # .card, .card-title, .hint
│       ├── _kpi.scss     # .kpi-row, .kpi
│       ├── _toolbar.scss # .toolbar — the filter row (density -5 fields)
│       ├── _form.scss    # .form-stack
│       ├── _banners.scss # banners, loading / empty states, .content-header, .config-card
│       └── _badges.scss
├── src/
│   ├── public-api.ts     # every wrapper, re-exported
│   └── lib/<name>/       # Stb<Name>Module + <name>.scss overrides + directives + story + MDX
├── .storybook/           # Storybook (theme toggle)
└── ng-package.json
```

The conventions live in the `css` and `material-overrides` skills (`.claude/skills/`).

## Scripts

```bash
npm run storybook           # serve Storybook on http://localhost:6006
npm run storybook:build     # static export → dist/storybook
npm run ui:build            # ng-packagr build → dist/ui (no-op while lib is CSS-only)
npm run ui:lint             # eslint
```

The app consumes the lib via `projects/frontend/apps/web/src/styles.scss`:

```scss
@use '../../../libs/ui/styles';
```

## Conventions

- **CSS-first**. Restyle Material through its override mixins (`mat.<name>-overrides(...)`) in `src/lib/<name>/<name>.scss`, never by hand-writing its CSS variables — the mixin emits whatever name Material reads, a hand-written one silently dies on a rename.
- **Peer dependencies follow the workspace's Angular major**. `package.json` declares `@angular/{common,core,material,cdk}` as `^<major>.0.0`, the major of the root `projects/frontend/package.json`. Inside the workspace nothing enforces the range and Dependabot doesn't touch it, so an Angular major bump must lift it by hand — `npm run ui:check-peers` (run by the frontend CI) fails until it does.
- **One source of truth for tokens**. Every colour, radius and shadow is a CSS custom property of `_tokens.scss` ; every spacing, font and icon size a step of `_sizes.scss`.
- **Stories live next to their wrapper** (`src/lib/<name>/<name>.stories.ts`) — one `Default` playground driven by the Controls panel, the docs in the sibling `.mdx`.
- **Only what the app uses.** A wrapper, directive or override no page needs is removed rather than kept "for later". Selector prefixes `ui` (components) and `stb` (directives).
