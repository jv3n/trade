import { Resource, Signal, linkedSignal } from '@angular/core';

/**
 * What [resource] last loaded, held while it loads for new params (#370) : its `value()` falls back
 * to `undefined` then, and what is on screen would blink. Null before the first value, while the
 * resource has no params, and once a load fails — a failed load shows nothing rather than an answer
 * to other params. Only a value that was read can be held : read it from the template, or from a
 * computed it binds.
 */
export function keptValue<T>(resource: Resource<T | undefined>): Signal<T | null> {
  return linkedSignal<{ value: T | undefined; cleared: boolean }, T | null>({
    source: () => ({
      value: resource.hasValue() ? resource.value() : undefined,
      cleared: resource.status() === 'error' || resource.status() === 'idle',
    }),
    computation: ({ value, cleared }, previous) =>
      cleared ? null : (value ?? previous?.value ?? null),
  }).asReadonly();
}
