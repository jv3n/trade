import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { keptValue } from './kept-value';

/**
 * Pins [keptValue] — the bridge between a resource and a listing that must not blink (#370). A
 * resource drops its value as soon as its params move ; the listing keeps the rows it has until
 * the new ones land, and only a failure clears them.
 */
describe('keptValue', () => {
  /** The day picked — the params. */
  let day: ReturnType<typeof signal<string>>;
  /** One subject per load, answered by the test. */
  let loads: Subject<string[]>[];
  let rows: ReturnType<typeof makeRows>;
  let kept: ReturnType<typeof keptValue<string[]>>;

  function makeRows() {
    return rxResource({
      params: () => day(),
      stream: () => {
        const load = new Subject<string[]>();
        loads.push(load);
        return load;
      },
    });
  }

  async function settle() {
    const app = TestBed.inject(ApplicationRef);
    app.tick();
    await app.whenStable();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    day = signal('2026-09-17');
    loads = [];
    TestBed.runInInjectionContext(() => {
      rows = makeRows();
      kept = keptValue(rows);
    });
  });

  it('is null until the first load answers', async () => {
    TestBed.inject(ApplicationRef).tick();
    expect(kept()).toBeNull();

    loads[0].next(['KTTA']);
    await settle();
    expect(kept()).toEqual(['KTTA']);
  });

  it('keeps the last rows while the next params load, then takes the new ones', async () => {
    TestBed.inject(ApplicationRef).tick();
    loads[0].next(['KTTA']);
    await settle();
    // Read, as the template does on each render : only a value read can be held.
    expect(kept()).toEqual(['KTTA']);

    day.set('2026-09-18');
    TestBed.inject(ApplicationRef).tick();
    expect(rows.value()).toBeUndefined();
    expect(kept()).toEqual(['KTTA']);

    loads[1].next(['SDEV']);
    await settle();
    expect(kept()).toEqual(['SDEV']);
  });

  it('clears once a load fails', async () => {
    TestBed.inject(ApplicationRef).tick();
    loads[0].next(['KTTA']);
    await settle();

    day.set('2026-09-18');
    TestBed.inject(ApplicationRef).tick();
    loads[1].error(new Error('500'));
    await settle();

    expect(kept()).toBeNull();
  });

  it('follows a local write on the resource', async () => {
    TestBed.inject(ApplicationRef).tick();
    loads[0].next(['KTTA']);
    await settle();

    rows.value.set(['KTTA', 'SDEV']);
    expect(kept()).toEqual(['KTTA', 'SDEV']);
  });
});
