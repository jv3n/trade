/**
 * Resolves the design tokens into plain CSS colours a canvas can paint.
 *
 * The tokens are `oklch()` values and `color-mix()` expressions holding `var(...)` references —
 * `getComputedStyle` hands those back **unresolved**, and a canvas cannot parse them. So the value
 * is pushed through a probe element's `color` property and read back : the browser resolves the
 * variables and the mix for us, and no colour maths lives here.
 *
 * The lib reads the `data-theme` attribute rather than injecting the app's `ThemeService` — a
 * design-system lib must not depend on the app that consumes it, and Storybook drives the same
 * attribute, so the playground gets the theme switch for free.
 */
export interface ChartPalette {
  accent: string;
  /** The accent faded to the given ratio — the gradient under an area. */
  accentFade: (ratio: number) => string;
  text: string;
  textMuted: string;
  border: string;
  surface: string;
  fontFamily: string;
}

/** Resolves one CSS colour expression against the document, through a throwaway probe. */
function resolveColor(expression: string): string {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  probe.style.color = expression;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved;
}

function token(name: string): string {
  return resolveColor(`var(${name})`);
}

export function readChartPalette(): ChartPalette {
  const fontFamily = getComputedStyle(document.documentElement)
    .getPropertyValue('--font-family')
    .trim();
  return {
    accent: token('--color-accent'),
    accentFade: (ratio) =>
      resolveColor(`color-mix(in srgb, var(--color-accent) ${ratio * 100}%, transparent)`),
    text: token('--color-text'),
    textMuted: token('--color-text-muted'),
    border: token('--color-border'),
    surface: token('--color-surface'),
    fontFamily: fontFamily || 'sans-serif',
  };
}

/**
 * Calls [onChange] whenever the active theme flips. Returns the teardown.
 *
 * Watches `<html data-theme>` — the one thing both the app (`ThemeService`) and Storybook write when
 * the palette changes.
 */
export function onThemeChange(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => observer.disconnect();
}
