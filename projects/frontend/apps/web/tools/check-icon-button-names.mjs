// Fails when an icon-only button has no accessible name (#258). `mat-icon` hides its glyph from
// assistive tech and `matTooltip` only adds a description, so without an `aria-label` a screen
// reader announces a bare "button". Angular ESLint's accessibility preset has no rule for it.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../src/app/', import.meta.url).pathname;

function* templates(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* templates(path);
    else if (entry.name.endsWith('.html')) yield path;
  }
}

// End of an opening tag, skipping any `>` inside a quoted attribute value (`a > 0`).
function tagEnd(source, from) {
  let quote = null;
  for (let i = from; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '>') return i;
  }
  return source.length;
}

const unnamed = [];
for (const path of templates(root)) {
  const source = readFileSync(path, 'utf8');
  for (const match of source.matchAll(/<(button|a)\b/g)) {
    const tag = source.slice(match.index, tagEnd(source, match.index) + 1);
    if (/\bmat-icon-button\b/.test(tag) && !/aria-label/.test(tag)) {
      const line = source.slice(0, match.index).split('\n').length;
      unnamed.push(`${relative(root, path)}:${line}`);
    }
  }
}

if (unnamed.length > 0) {
  unnamed.forEach((where) => console.error(`icon button without an accessible name — ${where}`));
  console.error("Give it [attr.aria-label]=\"'<key>' | translate\" (its tooltip's key does).");
  process.exit(1);
}
console.log('Every icon button has an accessible name.');
