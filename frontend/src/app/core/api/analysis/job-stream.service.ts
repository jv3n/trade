import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

/**
 * Granular pipeline state surfaced over SSE — mirrors the backend's `JobPhase` enum
 * (`com.portfolioai.analysis.domain.JobPhase`). The frontend reacts to terminal phases
 * (`DONE` / `ERROR`) the same way it used to react to the polled `JobStatus` ; the intermediate
 * phases are forwarded for the UX label work in PR3 ("Calling LLM (38s)…").
 */
export type JobPhase =
  | 'LOADING_CONTEXT'
  | 'CALLING_LLM'
  | 'RECEIVED_RAW'
  | 'PARSING'
  | 'VALIDATING'
  | 'RETRY_PROMPT'
  | 'PERSISTING'
  | 'DONE'
  | 'ERROR';

/**
 * One transition in the narrative pipeline. Wire format is the JSON serialisation of the backend
 * `JobEvent` data class (`com.portfolioai.analysis.domain.JobEvent`).
 */
export interface JobEvent {
  phase: JobPhase;
  attempt: number;
  elapsedMs: number;
  error: string | null;
  payload: string | null;
}

const TERMINAL_PHASES: ReadonlySet<JobPhase> = new Set<JobPhase>(['DONE', 'ERROR']);

/**
 * Opens a Server-Sent Events stream on a narrative job and emits one [JobEvent] per phase
 * transition. Replaces the 3-second `pollNarrativeJob` poller : the latency in the end-of-job
 * window drops to ~immediate, and the per-phase granularity unlocks the "Calling LLM (38s)…"
 * label the dossier ticker UI needs while Ollama mouilne for 60-180 s on Mac CPU.
 *
 * Lifecycle :
 * - subscribing opens an `EventSource` ;
 * - the observable emits each [JobEvent] received on the named `'phase'` channel ;
 * - the observable completes on a terminal phase ([DONE] / [ERROR]) and closes the underlying
 *   `EventSource` ;
 * - unsubscribing tears down the connection (so navigating away from the dossier mid-stream
 *   doesn't leak a sleeping SSE) ;
 * - if `EventSource` enters `CLOSED` _before_ a terminal phase, the observable errors — covers
 *   the case where the backend dies mid-stream and the browser stops auto-reconnecting.
 *
 * Replay-on-reconnect is server-side ([JobEventPublisher.register] retains events for ~60 s
 * after a terminal phase), so a late subscriber receives the full history before the live tail
 * — no extra logic needed here.
 */
@Injectable({ providedIn: 'root' })
export class JobStreamService {
  streamNarrativeJob(symbol: string, jobId: string): Observable<JobEvent> {
    const url = `/api/market/ticker/${encodeURIComponent(symbol)}/narrative/jobs/${encodeURIComponent(jobId)}/stream`;
    return new Observable<JobEvent>((observer) => {
      const es = new EventSource(url);
      let terminal = false;

      es.addEventListener('phase', (e) => {
        try {
          const event = JSON.parse((e as MessageEvent).data) as JobEvent;
          observer.next(event);
          if (TERMINAL_PHASES.has(event.phase)) {
            terminal = true;
            es.close();
            observer.complete();
          }
        } catch (err) {
          observer.error(err);
        }
      });

      es.onerror = () => {
        // Browsers auto-reconnect on transient failures unless `EventSource` reaches `CLOSED`.
        // Only escalate to a subscriber-visible error when we observe `CLOSED` _and_ haven't
        // seen a terminal phase yet (otherwise the close was triggered by our own teardown
        // after `DONE` / `ERROR` and the observer is already complete).
        if (es.readyState === EventSource.CLOSED && !terminal) {
          observer.error(new Error('SSE connection closed unexpectedly'));
        }
      };

      return () => {
        if (es.readyState !== EventSource.CLOSED) es.close();
      };
    });
  }
}
