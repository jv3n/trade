/**
 * Tests on [OllamaStatusService] — the signal-based wrapper around the polling daemon probe. The
 * panel on `/settings/configuration > LLM` consumes the signal directly, so the contract that
 * matters here is :
 *
 * - **Initial state** : `null` until the first refresh completes (the panel renders a spinner
 *   on the `null` branch).
 * - **Refresh success** : the signal lands on the freshly fetched payload.
 * - **Refresh failure** : the signal keeps its previous value (transient hiccup must NOT blank
 *   the panel — a flicker between green chip and "loading" every 10 s would be worse than just
 *   keeping the slightly stale value).
 * - **Polling** : `startPolling()` triggers an immediate refresh and queues a recurring tick ;
 *   `stopPolling()` clears the timer ; both are idempotent (defensive against double-mount).
 */
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { OllamaStatus, OllamaStatusRepository } from './ollama-status.repository';
import { OllamaStatusService } from './ollama-status.service';

class StubRepository extends OllamaStatusRepository {
  // Each `get()` call returns the next factory in the `getQueue` ; same shape for `unload`,
  // `pull`, and `delete` on their own queues. Lets tests pin an exact sequence (success, then
  // failure, then success) without juggling spies. Shared call counters are exposed for
  // assertions.
  getQueue: (() => Observable<OllamaStatus>)[] = [];
  unloadQueue: ((model: string) => Observable<OllamaStatus>)[] = [];
  pullQueue: ((model: string) => Observable<OllamaStatus>)[] = [];
  deleteQueue: ((model: string) => Observable<OllamaStatus>)[] = [];
  callCount = 0;
  unloadCalls: string[] = [];
  pullCalls: string[] = [];
  deleteCalls: string[] = [];

  get(): Observable<OllamaStatus> {
    this.callCount += 1;
    const next = this.getQueue.shift();
    if (!next) {
      throw new Error('StubRepository: get queue is empty — test forgot to enqueue a response');
    }
    return next();
  }

  unload(model: string): Observable<OllamaStatus> {
    this.unloadCalls.push(model);
    const next = this.unloadQueue.shift();
    if (!next) {
      throw new Error('StubRepository: unload queue is empty — test forgot to enqueue a response');
    }
    return next(model);
  }

  pull(model: string): Observable<OllamaStatus> {
    this.pullCalls.push(model);
    const next = this.pullQueue.shift();
    if (!next) {
      throw new Error('StubRepository: pull queue is empty — test forgot to enqueue a response');
    }
    return next(model);
  }

  delete(model: string): Observable<OllamaStatus> {
    this.deleteCalls.push(model);
    const next = this.deleteQueue.shift();
    if (!next) {
      throw new Error('StubRepository: delete queue is empty — test forgot to enqueue a response');
    }
    return next(model);
  }
}

const reachable: OllamaStatus = {
  daemonReachable: true,
  baseUrl: 'http://localhost:11434',
  latencyMs: 12,
  loadedModels: [{ name: 'qwen2.5:3b', expiresAt: null, sizeVramBytes: 2_008_000_000 }],
  availableModels: ['qwen2.5:3b'],
  errorMessage: null,
};

const unreachable: OllamaStatus = {
  daemonReachable: false,
  baseUrl: 'http://localhost:11434',
  latencyMs: null,
  loadedModels: [],
  availableModels: [],
  errorMessage: 'Connection refused',
};

describe('OllamaStatusService', () => {
  let service: OllamaStatusService;
  let stub: StubRepository;

  beforeEach(() => {
    stub = new StubRepository();
    TestBed.configureTestingModule({
      providers: [{ provide: OllamaStatusRepository, useValue: stub }, OllamaStatusService],
    });
    service = TestBed.inject(OllamaStatusService);
  });

  it('starts with a null status until the first refresh resolves', () => {
    expect(service.status()).toBeNull();
  });

  it('refresh sets the signal to the fetched snapshot', () => {
    stub.getQueue.push(() => of(reachable));
    service.refresh().subscribe();
    expect(service.status()).toEqual(reachable);
  });

  it('refresh keeps the previous signal value when the HTTP call fails', () => {
    stub.getQueue.push(() => of(reachable));
    service.refresh().subscribe();

    stub.getQueue.push(() => throwError(() => new Error('network is down')));
    service.refresh().subscribe();

    // Critical : the panel must not flicker back to `null` (the spinner state) on a transient
    // backend hiccup. Stale-but-rendered beats a spinner that comes back every poll tick.
    expect(service.status()).toEqual(reachable);
  });

  it('startPolling triggers an immediate refresh', () => {
    vi.useFakeTimers();
    try {
      stub.getQueue.push(() => of(reachable));
      service.startPolling(5_000);
      // The immediate refresh fires synchronously because `of(...)` emits in the same microtask
      // as the `.subscribe()` call inside `startPolling`.
      expect(stub.callCount).toBe(1);
    } finally {
      service.stopPolling();
      vi.useRealTimers();
    }
  });

  it('startPolling refreshes again on every interval tick', () => {
    vi.useFakeTimers();
    try {
      stub.getQueue.push(() => of(reachable));
      stub.getQueue.push(() => of(unreachable));
      stub.getQueue.push(() => of(reachable));

      service.startPolling(10_000);
      expect(stub.callCount).toBe(1);

      vi.advanceTimersByTime(10_000);
      expect(stub.callCount).toBe(2);

      vi.advanceTimersByTime(10_000);
      expect(stub.callCount).toBe(3);
    } finally {
      service.stopPolling();
      vi.useRealTimers();
    }
  });

  it('startPolling is idempotent — calling twice does not double the tick frequency', () => {
    vi.useFakeTimers();
    try {
      stub.getQueue.push(() => of(reachable));
      stub.getQueue.push(() => of(reachable));

      service.startPolling(5_000);
      service.startPolling(5_000); // second call should be a no-op
      // Only one immediate refresh from the first call.
      expect(stub.callCount).toBe(1);

      vi.advanceTimersByTime(5_000);
      // One tick fired, not two.
      expect(stub.callCount).toBe(2);
    } finally {
      service.stopPolling();
      vi.useRealTimers();
    }
  });

  it('stopPolling clears the timer and is safe to call when no polling is active', () => {
    vi.useFakeTimers();
    try {
      stub.getQueue.push(() => of(reachable));
      service.startPolling(5_000);
      service.stopPolling();

      vi.advanceTimersByTime(20_000);
      // Only the immediate refresh fired ; the interval was cleared before any tick.
      expect(stub.callCount).toBe(1);

      // Idempotency : calling stop twice (defensive against double-destroy) should not throw.
      expect(() => service.stopPolling()).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  // -------------------------------------------------------------------- unload

  it('unload forwards the model name and updates the signal with the post-action snapshot', () => {
    const postUnload: OllamaStatus = {
      ...reachable,
      loadedModels: [], // VRAM emptied
    };
    stub.unloadQueue.push(() => of(postUnload));

    service.unload('qwen2.5:3b').subscribe();

    expect(stub.unloadCalls).toEqual(['qwen2.5:3b']);
    expect(service.status()).toEqual(postUnload);
  });

  it('unload preserves the previous signal value when the HTTP call fails', () => {
    // Land a known good snapshot first, then fail the unload.
    stub.getQueue.push(() => of(reachable));
    service.refresh().subscribe();

    stub.unloadQueue.push(() => throwError(() => new Error('backend down')));
    service.unload('qwen2.5:3b').subscribe();

    // Same contract as refresh failure — the panel keeps showing what it had instead of
    // flipping back to spinner / null.
    expect(service.status()).toEqual(reachable);
  });

  // -------------------------------------------------------------------- pull

  it('pull forwards the model name and updates the signal with the post-action snapshot', () => {
    const postPull: OllamaStatus = {
      ...reachable,
      availableModels: ['mistral:7b', 'qwen2.5:3b'],
    };
    stub.pullQueue.push(() => of(postPull));

    let emitted: OllamaStatus | undefined;
    service.pull('mistral:7b').subscribe((snap) => (emitted = snap));

    expect(stub.pullCalls).toEqual(['mistral:7b']);
    expect(emitted).toEqual(postPull);
    // The shared signal updates so the parent panel re-renders the new model in `availableModels`
    // without waiting for the next 10 s polling tick.
    expect(service.status()).toEqual(postPull);
  });

  it('pull surfaces transport errors so the dialog can render an inline error message', () => {
    // Distinct from the [unload] / [refresh] contract : pull is invoked by an explicit user
    // click and the dialog needs to surface a failure rather than silently leave the user
    // staring at a spinner. The service swallows nothing on this path — errors flow through the
    // Observable error channel rather than as a thrown Promise rejection.
    stub.pullQueue.push(() => throwError(() => new Error('Pull failed: registry unreachable')));

    let captured: unknown;
    service.pull('mistral:7b').subscribe({ error: (e) => (captured = e) });

    expect((captured as Error).message).toContain('registry unreachable');
  });

  // -------------------------------------------------------------------- delete

  it('delete forwards the model name and updates the signal with the post-action snapshot', () => {
    // Pre-state : two models pulled. Post-state : one removed by the delete.
    stub.deleteQueue.push(() =>
      of({
        ...reachable,
        availableModels: ['qwen2.5:3b'],
      }),
    );

    service.delete('mistral:7b').subscribe();

    expect(stub.deleteCalls).toEqual(['mistral:7b']);
    expect(service.status()?.availableModels).toEqual(['qwen2.5:3b']);
  });

  it('delete preserves the previous signal value when the HTTP call fails', () => {
    // Mirror of the unload contract — delete is best-effort UX (the panel's next polling tick
    // will resync). A transient failure must not blank the panel.
    stub.getQueue.push(() => of(reachable));
    service.refresh().subscribe();

    stub.deleteQueue.push(() => throwError(() => new Error('backend down')));
    service.delete('mistral:7b').subscribe();

    expect(service.status()).toEqual(reachable);
  });
});
