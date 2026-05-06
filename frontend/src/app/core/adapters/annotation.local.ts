import { Injectable } from '@angular/core';
import { Observable, defer, of } from 'rxjs';
import { Annotation, AnnotationRepository } from '../annotation.repository';

/**
 * `localStorage`-backed implementation of [AnnotationRepository]. One JSON blob per symbol under
 * the key `ticker-annotations:{SYMBOL}` — keeps the get/put paths trivial and avoids parsing a
 * monolithic store on every read. Symbols are normalised (trim + uppercase) so AAPL and aapl
 * share the same bucket.
 *
 * Single-user, mono-machine — no sync. Acceptable for the Phase 2 dossier ticker scope ; if we
 * ever want multi-device sync we swap this adapter for a backend-backed one behind the same port,
 * the rest of the app doesn't care.
 *
 * **SSR safety** — `localStorage` is browser-only. The current Angular build ships CSR-only so
 * it's available at runtime ; if SSR comes back later, wrap accesses in `isPlatformBrowser`.
 */
@Injectable({ providedIn: 'root' })
export class LocalStorageAnnotationRepository extends AnnotationRepository {
  private static readonly KEY_PREFIX = 'ticker-annotations:';

  list(symbol: string): Observable<Annotation[]> {
    return of(this.read(symbol));
  }

  add(symbol: string, ann: Omit<Annotation, 'id' | 'symbol'>): Observable<Annotation> {
    // `defer` so a synchronous throw in `write` (quota exceeded, Safari private mode) lands as
    // an error notification on the observable and the caller's `error: () => …` handler runs —
    // a bare `of()` with a throw before it would propagate the exception out of `subscribe()`.
    return defer(() => {
      const sym = this.normalise(symbol);
      const created: Annotation = { ...ann, id: this.generateId(), symbol: sym };
      const next = [...this.read(sym), created];
      this.write(sym, next);
      return of(created);
    });
  }

  remove(symbol: string, id: string): Observable<void> {
    return defer(() => {
      const sym = this.normalise(symbol);
      const next = this.read(sym).filter((a) => a.id !== id);
      this.write(sym, next);
      return of(void 0);
    });
  }

  private read(symbol: string): Annotation[] {
    const raw = localStorage.getItem(this.keyFor(symbol));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as Annotation[];
      // Defensive : if a future schema landed and the parse returns the wrong shape, fall back
      // to empty rather than crash the dossier. The user loses unsynced annotations which is
      // a small price vs a broken page.
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private write(symbol: string, annotations: Annotation[]): void {
    if (annotations.length === 0) {
      localStorage.removeItem(this.keyFor(symbol));
      return;
    }
    localStorage.setItem(this.keyFor(symbol), JSON.stringify(annotations));
  }

  private keyFor(symbol: string): string {
    return `${LocalStorageAnnotationRepository.KEY_PREFIX}${this.normalise(symbol)}`;
  }

  private normalise(symbol: string): string {
    return symbol.trim().toUpperCase();
  }

  private generateId(): string {
    // `crypto.randomUUID` is available in all modern browsers ; fallback for older runtimes
    // (and tests where the JSDOM polyfill is absent) keeps the contract honest.
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `ann-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(16)}`;
  }
}
