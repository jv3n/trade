// jsdom ships no ResizeObserver, and `StbChart` builds one as soon as a chart is drawn (#592).
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe = () => undefined;
    unobserve = () => undefined;
    disconnect = () => undefined;
  };
}

// jsdom's canvas has no context, and ECharts paints through one : every call is swallowed, the few
// whose result zrender reads back return an inert value. Replaces jsdom's own `getContext`, which
// only logs « not implemented » — remove it if the `canvas` package ever joins the test setup.
if (typeof HTMLCanvasElement !== 'undefined') {
  const noop = () => undefined;
  const inert: Record<string, (...args: unknown[]) => unknown> = {
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({ setTransform: noop }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    getLineDash: () => [],
    isPointInPath: () => false,
  };
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string) {
    if (type !== '2d') return null;
    const state: Record<string | symbol, unknown> = { canvas: this };
    // Any unknown key reads as a method : a property zrender has not set yet comes back as a
    // function, not undefined. Stored on first read so `ctx.save === ctx.save`.
    return new Proxy(state, {
      get: (target, key) => {
        if (!(key in target)) target[key] = inert[key as string] ?? noop;
        return target[key];
      },
      set: (target, key, value) => {
        target[key] = value;
        return true;
      },
    });
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
