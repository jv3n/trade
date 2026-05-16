import { Observable } from 'rxjs';

/**
 * Lightweight chart annotation persisted by symbol. v3 ships a single kind — a horizontal price
 * line — but the discriminated `kind` field leaves room for vertical date markers, ranges, or
 * text-only labels later without a schema migration.
 */
export interface Annotation {
  /** Stable client-side id (UUID-like) — the localStorage adapter generates it on `add`. */
  id: string;
  /** Uppercase ticker the annotation belongs to. The store keys by symbol so re-opening the
   *  same dossier restores its annotations ; switching ticker hides them (no cross-symbol leak). */
  symbol: string;
  /** Discriminator — only `'hline'` is implemented in v3, future kinds extend the union. */
  kind: 'hline';
  /** For `kind: 'hline'` — the price level the line is anchored to, in the ticker's currency. */
  value: number;
  /** Optional free-text label (~20 chars max in the UI) ; null when the user didn't enter one. */
  label?: string | null;
}

/**
 * Port — read/write access to chart annotations. Backed by `LocalStorageAnnotationRepository` in
 * v3 (single-user, mono-machine, no sync). When we ever want multi-device sync we add a backend
 * adapter behind the same port — a future BDD-backed implementation drops in without a UI rewrite.
 *
 * All methods are scoped by `symbol` (uppercase). The store is responsible for generating ids and
 * normalising the symbol input (trim + uppercase).
 */
export abstract class AnnotationRepository {
  /** Returns the (possibly empty) list of annotations for [symbol], oldest first. */
  abstract list(symbol: string): Observable<Annotation[]>;
  /** Adds a new annotation and returns it (with the generated id). The caller must NOT pass an
   *  id — the store generates one. */
  abstract add(symbol: string, ann: Omit<Annotation, 'id' | 'symbol'>): Observable<Annotation>;
  /** Removes an annotation by id. Idempotent : a missing id is a no-op (the optimistic UI may
   *  have already filtered it out before the call lands). */
  abstract remove(symbol: string, id: string): Observable<void>;
}
