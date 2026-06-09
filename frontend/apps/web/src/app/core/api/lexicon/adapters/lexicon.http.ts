import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { LexiconEntry, LexiconEntryInput } from '../lexicon.model';
import { LexiconRepository } from '../lexicon.repository';

// Wire DTO — the shape Spring serialises on `/api/lexicon`. It also carries `createdAt` /
// `updatedAt`, which the UI doesn't use, so we drop them in the mapping below.
interface LexiconEntryWireDto {
  id: string;
  term: string;
  definitionFr: string;
  definitionEn: string;
}

function fromWire(w: LexiconEntryWireDto): LexiconEntry {
  return { id: w.id, term: w.term, definitionFr: w.definitionFr, definitionEn: w.definitionEn };
}

function toWire(input: LexiconEntryInput): LexiconEntryInput {
  return {
    term: input.term.trim(),
    definitionFr: input.definitionFr.trim(),
    definitionEn: input.definitionEn.trim(),
  };
}

/**
 * Default adapter for [LexiconRepository] — plain JSON CRUD against `/api/lexicon`. No date
 * mapping (the domain shape has none) ; `term` / `definition` are trimmed on the way out.
 */
@Injectable()
export class HttpLexiconRepository extends LexiconRepository {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/lexicon';

  findAll(): Observable<LexiconEntry[]> {
    return this.http.get<LexiconEntryWireDto[]>(this.base).pipe(map((rows) => rows.map(fromWire)));
  }

  create(input: LexiconEntryInput): Observable<LexiconEntry> {
    return this.http.post<LexiconEntryWireDto>(this.base, toWire(input)).pipe(map(fromWire));
  }

  update(id: string, input: LexiconEntryInput): Observable<LexiconEntry> {
    return this.http
      .put<LexiconEntryWireDto>(`${this.base}/${id}`, toWire(input))
      .pipe(map(fromWire));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
