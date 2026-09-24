# Mockups

Static HTML mockups, used to redefine the trading tracker before recoding it. The copy inside them
stays in French : it mirrors the app's own interface.

- Open `index.html` straight in a browser — no dependency, no build.
- `assets/mockup.css` : tokens (dark / light theme) and shared components.
- `assets/mockup.js` : theme toggle, segmented groups (USD / CAD, FR / EN), clickable rows.
- `PARCOURS.md` : the user journey, step by step — the reference the mockups follow.
- The data is fictional but consistent across the pages : the journal's trades feed the account,
  match the stats rows, and the KTTA candidate becomes the stat and then the trade of 17/09.

## Icons

**Material Symbols Rounded** (Google Fonts). Use the names below as-is in `<mat-icon>`.

| Use | Icon |
|-----|------|
| Menu — Today / Account / Candidates / Stats / Journal / Calculator / Lexicon | `today` · `account_balance_wallet` · `radar` · `query_stats` · `menu_book` · `calculate` · `dictionary` |
| Copy a result | `content_copy` |
| Edit / delete | `edit` · `delete` |
| Add / deposit / withdrawal | `add` · `add` · `remove` |
| CSV export | `import_export` |
| Promote to stat / to trade, "view" links | `arrow_forward` |
| Promote every candidate | `keyboard_double_arrow_right` |
| Previous / next day, back | `chevron_left` · `chevron_right` · `arrow_back` |
| Step done, "in stats" status | `check` |
| Light / dark theme | `light_mode` · `dark_mode` |
| Drop a chart screenshot | `add_photo_alternate` |

Style : thin stroke (`wght` 400), outlined ; the active menu entry switches to the **filled** icon
(`FILL` 1).
