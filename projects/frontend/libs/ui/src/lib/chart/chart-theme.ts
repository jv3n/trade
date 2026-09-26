/**
 * Resolves the design tokens into plain CSS colours a canvas can paint.
 *
 * The tokens are `oklch()` values and `color-mix()` expressions holding `var(...)` references —
 * `getComputedStyle` hands those back **unresolved**, and a canvas cannot parse them. So the value
 * is pushed through a probe element's `color` property and read back : the browser resolves the
 * variables and the mix for us, and no colour maths lives here.
 *
 * What comes back is still `oklch(…)` or `color(srgb …)`, which ECharts' colour parser reads as
 * `undefined` — and then throws mid-animation when it blends two gradients. So the resolved colour
 * is painted on a one-pixel canvas and read back as plain `rgba()`.
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

let pixel: CanvasRenderingContext2D | null | undefined;

/** The colour as `[r, g, b, a]` in 0–255, or null where there is no canvas (jsdom). */
function paint(color: string): Uint8ClampedArray | null {
  pixel ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext(
    '2d',
    { willReadFrequently: true },
  );
  if (!pixel) return null;
  pixel.clearRect(0, 0, 1, 1);
  pixel.fillStyle = color;
  pixel.fillRect(0, 0, 1, 1);
  return pixel.getImageData(0, 0, 1, 1).data;
}

function rgba([r, g, b]: Uint8ClampedArray, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 1000) / 1000})`;
}

/** A token as a colour ECharts can parse — `rgba()`, whatever colour space the token is in. */
function token(name: string): string {
  const resolved = resolveColor(`var(${name})`);
  const channels = paint(resolved);
  return channels ? rgba(channels, channels[3] / 255) : resolved;
}

export function readChartPalette(): ChartPalette {
  const fontFamily = getComputedStyle(document.documentElement)
    .getPropertyValue('--font-family')
    .trim();
  const accent = resolveColor('var(--color-accent)');
  const accentChannels = paint(accent);
  return {
    accent: accentChannels ? rgba(accentChannels, 1) : accent,
    // The fade keeps the accent's own channels : painting a near-transparent colour and reading it
    // back would round its channels away, and the gradient would fade through grey.
    accentFade: (ratio) =>
      accentChannels
        ? rgba(accentChannels, ratio)
        : resolveColor(`color-mix(in srgb, var(--color-accent) ${ratio * 100}%, transparent)`),
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
