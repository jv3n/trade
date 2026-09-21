// WCAG contrast of the palette, both themes : every text / fill pair below must reach AA (4.5:1).
import { readFileSync } from 'node:fs';

const tokensScss = readFileSync(new URL('../styles/_tokens.scss', import.meta.url), 'utf8');

const AA = 4.5;

const TEXTS = [
  'text',
  'text-muted',
  'text-dim',
  'text-faint',
  'accent',
  'accent-strong',
  'success',
  'danger',
  'warning',
];
const SURFACES = ['bg', 'surface', 'surface-2'];
const PAIRS = [
  ...TEXTS.flatMap((fg) => SURFACES.map((bg) => [fg, bg])),
  ['on-accent', 'accent'],
  ['on-success', 'success'],
  ['on-danger', 'danger'],
  ['on-warning', 'warning'],
];

function block(selector) {
  const start = tokensScss.indexOf(`\n${selector} {`);
  return tokensScss.slice(start, tokensScss.indexOf('\n}', start));
}

function colours(css) {
  return Object.fromEntries(
    [...css.matchAll(/--color-([a-z0-9-]+):\s*oklch\(([\d.\s]+)\)/g)].map(([, name, v]) => [
      name,
      v.trim().split(/\s+/).map(Number),
    ]),
  );
}

// OKLCH → linear sRGB (Björn Ottosson's matrices), clamped to the gamut.
function linearRgb([L, C, h]) {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => Math.min(1, Math.max(0, c)));
}

const luminance = (c) => {
  const [r, g, b] = linearRgb(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function ratio(fg, bg) {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const dark = colours(block(':root'));
const themes = { dark, light: { ...dark, ...colours(block("[data-theme='light']")) } };

const failures = [];
for (const [theme, palette] of Object.entries(themes)) {
  for (const [fg, bg] of PAIRS) {
    const key = `${fg} on ${bg}`;
    const measured = Math.round(ratio(palette[fg], palette[bg]) * 100) / 100;
    if (measured < AA) failures.push(`${theme}: ${key} = ${measured} (must be >= ${AA})`);
  }
}

if (failures.length > 0) {
  failures.forEach((f) => console.error(f));
  process.exit(1);
}
console.log('Palette contrast reaches WCAG AA in both themes.');
