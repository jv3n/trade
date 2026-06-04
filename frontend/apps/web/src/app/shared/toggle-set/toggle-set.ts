/**
 * Immutable Set toggle — returns a new `Set` with `value` added if absent, removed if present.
 * Pairs naturally with `signal.update((s) => toggleSet(s, value))` for signal-driven UI state
 * (collapsed batches, expanded snapshots, selected chips, …).
 */
export function toggleSet<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
