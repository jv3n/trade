import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HttpLexiconRepository } from './lexicon.http';

/**
 * Pins the wire ↔ domain mapping inside [HttpLexiconRepository]. The lexicon CRUD is plain JSON,
 * so the contract is narrow but worth pinning :
 *
 *  - **findAll** maps the array (both `definitionFr` / `definitionEn`) and drops the wire-only
 *    `createdAt` / `updatedAt`.
 *  - **create / update** trim `term` + both definitions on the way to the wire and hit the right
 *    verb / URL (`POST /api/lexicon`, `PUT /api/lexicon/:id`).
 *  - **delete** sends `DELETE /api/lexicon/:id` with no body.
 */
describe('HttpLexiconRepository', () => {
  let repo: HttpLexiconRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpLexiconRepository],
    });
    repo = TestBed.inject(HttpLexiconRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('findAll GETs /api/lexicon and maps to the domain shape (no wire timestamps)', () => {
    repo.findAll().subscribe((rows) => {
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        id: 'abc',
        term: 'GUS',
        definitionFr: 'Gap Up Short',
        definitionEn: 'Gap Up Short',
      });
    });
    const req = http.expectOne('/api/lexicon');
    expect(req.request.method).toBe('GET');
    req.flush([
      {
        id: 'abc',
        term: 'GUS',
        definitionFr: 'Gap Up Short',
        definitionEn: 'Gap Up Short',
        createdAt: '2026-06-09T10:00:00Z',
        updatedAt: '2026-06-09T10:00:00Z',
      },
    ]);
  });

  it('create POSTs the trimmed term + both definitions', () => {
    repo
      .create({
        term: '  Halt  ',
        definitionFr: '  Suspension  ',
        definitionEn: '  Trading halt  ',
      })
      .subscribe();
    const req = http.expectOne('/api/lexicon');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      term: 'Halt',
      definitionFr: 'Suspension',
      definitionEn: 'Trading halt',
    });
    req.flush({
      id: 'new',
      term: 'Halt',
      definitionFr: 'Suspension',
      definitionEn: 'Trading halt',
    });
  });

  it('update PUTs to /:id with the trimmed payload', () => {
    repo
      .update('abc', { term: 'GUS', definitionFr: '  révisé  ', definitionEn: '  revised  ' })
      .subscribe();
    const req = http.expectOne('/api/lexicon/abc');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      term: 'GUS',
      definitionFr: 'révisé',
      definitionEn: 'revised',
    });
    req.flush({ id: 'abc', term: 'GUS', definitionFr: 'révisé', definitionEn: 'revised' });
  });

  it('delete sends DELETE /:id with no body', () => {
    repo.delete('abc').subscribe();
    const req = http.expectOne('/api/lexicon/abc');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
