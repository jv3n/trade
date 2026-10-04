import { Component, computed, input, numberAttribute } from '@angular/core';

export type StbSkeletonVariant = 'text' | 'line' | 'block' | 'circle' | 'chip';

/** A CSS size : a number is pixels, a string goes through as written (`60%`, `8rem`). */
export type StbSkeletonSize = number | string | null;

function toCss(size: StbSkeletonSize): string | null {
  return typeof size === 'number' ? `${size}px` : size;
}

/**
 * A placeholder shaped like the content about to load (#539) — neutral, with a slow shimmer and a
 * still fill under reduced motion. Hidden from assistive tech : the region that is loading carries
 * `aria-busy` and the spoken label, which the `ui-skeleton-*` patterns do.
 *
 * `count` stacks several blocks of the same variant, for paragraph lines.
 */
@Component({
  selector: 'ui-skeleton',
  template: `
    @for (i of blocks(); track i) {
      <span
        [class]="'stb-skeleton stb-skeleton--' + variant()"
        [style.width]="width()"
        [style.height]="height()"
      ></span>
    }
  `,
  host: { class: 'stb-skeleton-host', 'aria-hidden': 'true' },
})
export class StbSkeleton {
  readonly variant = input<StbSkeletonVariant>('text');
  readonly width = input<string | null, StbSkeletonSize>(null, { transform: toCss });
  readonly height = input<string | null, StbSkeletonSize>(null, { transform: toCss });
  readonly count = input(1, { transform: numberAttribute });

  protected readonly blocks = computed(() =>
    Array.from({ length: Math.max(1, this.count()) }, (_, i) => i),
  );
}
