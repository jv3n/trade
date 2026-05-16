/**
 * Tests on [toggleSet] — the immutable Set toggle used everywhere a signal-driven UI flips a
 * value in/out of a selection (collapsed batches, expanded snapshots, chip filters, …). The
 * function is generic and pure ; we just pin the contract.
 */
import { toggleSet } from './toggle-set';

describe('toggleSet', () => {
  it('adds the value when absent', () => {
    expect([...toggleSet(new Set(['a', 'b']), 'c')]).toEqual(['a', 'b', 'c']);
  });

  it('removes the value when present', () => {
    expect([...toggleSet(new Set(['a', 'b']), 'a')]).toEqual(['b']);
  });

  it('returns a new Set — never mutates the input', () => {
    const input = new Set(['a']);
    const output = toggleSet(input, 'b');
    expect(output).not.toBe(input);
    expect([...input]).toEqual(['a']);
  });

  it('handles empty input', () => {
    expect([...toggleSet(new Set<string>(), 'a')]).toEqual(['a']);
  });

  it('round-trips — adding then removing yields a Set equivalent to the source', () => {
    const source = new Set(['a', 'b']);
    const added = toggleSet(source, 'c');
    const removed = toggleSet(added, 'c');
    expect([...removed].sort()).toEqual([...source].sort());
  });
});
