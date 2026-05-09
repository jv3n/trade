/**
 * Tests on [JobStreamService] — pin the `EventSource` lifecycle that backs the SSE narrative
 * stream. The service replaces the 3-second poller as the bridge between
 * `POST /narrative` (which kicks the `@Async` runner) and the dossier ticker UI : it must be
 * honest about terminal completion, error escalation, and teardown, otherwise the spinner either
 * spins forever or fires unsolicited errors that pollute the page.
 *
 * What we pin :
 * - **URL contract** — the service hits the right SSE endpoint (`/api/market/ticker/:symbol
 *   /narrative/jobs/:jobId/stream`) with both path segments URL-encoded.
 * - **Forward each phase event to the subscriber** — every `'phase'` SSE event lands as a parsed
 *   [JobEvent] in `observer.next`, in order.
 * - **Complete on terminal** — `DONE` / `ERROR` close the underlying `EventSource` and call
 *   `observer.complete()`. Otherwise the dossier component would never clear its loading state.
 * - **Error on premature close** — if the connection enters `CLOSED` before any terminal phase,
 *   the observer receives an `error` (covers the backend-died-mid-stream case).
 * - **Stay quiet on close after terminal** — when we close the connection ourselves after `DONE`,
 *   the subsequent `onerror` (some browsers fire one) must NOT escalate to a subscriber error.
 * - **Teardown closes the connection** — `subscription.unsubscribe()` closes the `EventSource` so
 *   navigating away mid-stream doesn't leak a sleeping connection.
 * - **Late subscriber gets replay then live tail** — covered by server-side replay
 *   ([JobEventPublisher.register]), so a late subscribe simply receives whatever the server
 *   chooses to send. We pin that the service forwards everything verbatim.
 */
import { TestBed } from '@angular/core/testing';
import { JobEvent, JobPhase, JobStreamService } from './job-stream.service';

class MockEventSource {
  static instances: MockEventSource[] = [];
  static OPEN = 1;
  static CLOSED = 2;

  url: string;
  readyState = MockEventSource.OPEN;
  onerror: ((e: Event) => void) | null = null;
  private listeners = new Map<string, ((e: MessageEvent) => void)[]>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: (e: MessageEvent) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(fn);
    this.listeners.set(type, existing);
  }

  close(): void {
    this.readyState = MockEventSource.CLOSED;
  }

  emitPhase(event: JobEvent): void {
    const listeners = this.listeners.get('phase') ?? [];
    listeners.forEach((fn) => fn(new MessageEvent('phase', { data: JSON.stringify(event) })));
  }

  emitMalformedPhase(rawData: string): void {
    const listeners = this.listeners.get('phase') ?? [];
    listeners.forEach((fn) => fn(new MessageEvent('phase', { data: rawData })));
  }

  emitError(closing: boolean): void {
    if (closing) this.readyState = MockEventSource.CLOSED;
    this.onerror?.(new Event('error'));
  }
}

const STUB_GLOBAL_KEY = 'EventSource';

function buildEvent(phase: JobPhase, overrides: Partial<JobEvent> = {}): JobEvent {
  return {
    phase,
    attempt: 1,
    elapsedMs: 100,
    error: null,
    payload: null,
    ...overrides,
  };
}

describe('JobStreamService', () => {
  let service: JobStreamService;

  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal(STUB_GLOBAL_KEY, MockEventSource);
    TestBed.configureTestingModule({});
    service = TestBed.inject(JobStreamService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens an EventSource on the correctly URL-encoded stream endpoint', () => {
    const sub = service.streamNarrativeJob('BRK.B', 'job 1').subscribe();

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe(
      '/api/market/ticker/BRK.B/narrative/jobs/job%201/stream',
    );
    sub.unsubscribe();
  });

  it('forwards each phase event to the subscriber in the order they arrive', () => {
    const received: JobEvent[] = [];
    service.streamNarrativeJob('AAPL', 'j1').subscribe((e) => received.push(e));
    const es = MockEventSource.instances[0];

    es.emitPhase(buildEvent('LOADING_CONTEXT', { elapsedMs: 5 }));
    es.emitPhase(buildEvent('CALLING_LLM', { elapsedMs: 50 }));
    es.emitPhase(buildEvent('RECEIVED_RAW', { elapsedMs: 8000 }));

    expect(received.map((e) => e.phase)).toEqual([
      'LOADING_CONTEXT',
      'CALLING_LLM',
      'RECEIVED_RAW',
    ]);
    expect(received[2].elapsedMs).toBe(8000);
  });

  it('completes the observable and closes the connection on a DONE phase', () => {
    let completed = false;
    const received: JobEvent[] = [];
    service.streamNarrativeJob('AAPL', 'j1').subscribe({
      next: (e) => received.push(e),
      complete: () => (completed = true),
    });
    const es = MockEventSource.instances[0];

    es.emitPhase(buildEvent('CALLING_LLM'));
    es.emitPhase(buildEvent('DONE'));

    expect(received.map((e) => e.phase)).toEqual(['CALLING_LLM', 'DONE']);
    expect(completed).toBe(true);
    expect(es.readyState).toBe(MockEventSource.CLOSED);
  });

  it('completes the observable and closes the connection on an ERROR phase', () => {
    let completed = false;
    const received: JobEvent[] = [];
    service.streamNarrativeJob('AAPL', 'j1').subscribe({
      next: (e) => received.push(e),
      complete: () => (completed = true),
    });
    const es = MockEventSource.instances[0];

    es.emitPhase(buildEvent('ERROR', { error: 'LLM timeout after 400s' }));

    expect(received).toHaveLength(1);
    expect(received[0].error).toBe('LLM timeout after 400s');
    expect(completed).toBe(true);
    expect(es.readyState).toBe(MockEventSource.CLOSED);
  });

  it('errors when the connection closes before any terminal phase', () => {
    let errored: Error | null = null;
    service.streamNarrativeJob('AAPL', 'j1').subscribe({
      error: (err: Error) => (errored = err),
    });
    const es = MockEventSource.instances[0];

    es.emitPhase(buildEvent('LOADING_CONTEXT'));
    // Backend died — the browser bumps EventSource to CLOSED then fires `onerror`.
    es.emitError(/* closing= */ true);

    expect(errored).not.toBeNull();
    expect(errored!.message).toContain('closed unexpectedly');
  });

  it('does not error when the connection closes after a terminal phase', () => {
    let errored: Error | null = null;
    let completed = false;
    service.streamNarrativeJob('AAPL', 'j1').subscribe({
      error: (err: Error) => (errored = err),
      complete: () => (completed = true),
    });
    const es = MockEventSource.instances[0];

    es.emitPhase(buildEvent('DONE'));
    // Some browsers fire onerror immediately after the server completes the SSE — must stay
    // quiet because the observer is already terminal.
    es.emitError(/* closing= */ true);

    expect(completed).toBe(true);
    expect(errored).toBeNull();
  });

  it('stays alive on a transient error that does not close the connection', () => {
    let errored: Error | null = null;
    let completed = false;
    service.streamNarrativeJob('AAPL', 'j1').subscribe({
      error: (err: Error) => (errored = err),
      complete: () => (completed = true),
    });
    const es = MockEventSource.instances[0];

    // EventSource fires `onerror` while staying in OPEN during a transient hiccup ; the browser
    // re-resolves on its own. Don't kill the subscriber.
    es.emitError(/* closing= */ false);

    expect(errored).toBeNull();
    expect(completed).toBe(false);
    expect(es.readyState).toBe(MockEventSource.OPEN);
  });

  it('closes the EventSource when the subscription is unsubscribed mid-flight', () => {
    const sub = service.streamNarrativeJob('AAPL', 'j1').subscribe();
    const es = MockEventSource.instances[0];

    expect(es.readyState).toBe(MockEventSource.OPEN);
    sub.unsubscribe();

    expect(es.readyState).toBe(MockEventSource.CLOSED);
  });

  it('emits an observer error when a phase event arrives with malformed JSON', () => {
    let errored: Error | null = null;
    service.streamNarrativeJob('AAPL', 'j1').subscribe({
      error: (err: Error) => (errored = err),
    });
    const es = MockEventSource.instances[0];

    // Drift between back and front (e.g. partial deploy) shouldn't leave the observer hanging.
    es.emitMalformedPhase('not-json');

    expect(errored).not.toBeNull();
  });
});
