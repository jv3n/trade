import { Observable } from 'rxjs';
import { LexiconEntry, LexiconEntryInput } from './lexicon.model';

/**
 * Port — CRUD over the trading lexicon (global, shared glossary). The listing is unpaged : the
 * dataset is small (~120 rows) and the page searches it client-side, so there is no filter /
 * pagination on the wire. The default adapter (`HttpLexiconRepository` in `adapters/lexicon.http.ts`)
 * owns the HTTP wire format ; consumers only ever see the domain [LexiconEntry] shapes.
 */
export abstract class LexiconRepository {
  /** Full glossary, alphabetical by term. */
  abstract findAll(): Observable<LexiconEntry[]>;
  abstract create(input: LexiconEntryInput): Observable<LexiconEntry>;
  abstract update(id: string, input: LexiconEntryInput): Observable<LexiconEntry>;
  abstract delete(id: string): Observable<void>;
}
