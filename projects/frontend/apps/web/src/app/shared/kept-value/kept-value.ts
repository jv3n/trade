import { Resource, ResourceStatus, Signal, linkedSignal } from '@angular/core';

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

/**
 * Whether [resource]'s last load failed — from a failure until its next value, a retry in flight
 * included, so a banner and its « Retry » stay up while the retry runs (#493). A resource without
 * params has nothing missing, like [keptValue] clears then. Like it too, it only remembers what was
 * read.
 */
export function lastLoadFailed(resource: Resource<unknown>): Signal<boolean> {
  return linkedSignal<ResourceStatus, boolean>({
    source: resource.status,
    computation: (status, previous) => {
      if (status === 'error') return true;
      if (status === 'resolved' || status === 'local' || status === 'idle') return false;
      return previous?.value ?? false;
    },
  }).asReadonly();
}
