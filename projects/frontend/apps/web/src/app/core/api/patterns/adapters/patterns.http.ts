import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PatternsRepository } from '../patterns.repository';

/**
 * Reads the files from the app's own assets : `tools/copy-docs.mjs` copies `docs/pattern/` and
 * `docs/notes/` into `public/docs/` before every start and build. Not under `patterns/`, which would
 * shadow the `/patterns` page route on the server.
 */
@Injectable()
export class HttpPatternsRepository extends PatternsRepository {
  private readonly http = inject(HttpClient);

  markdown(folder: 'pattern' | 'notes', file: string, lang: 'fr' | 'en'): Observable<string> {
    const suffix = lang === 'fr' ? '.fr' : '';
    return this.http.get(`/docs/${folder}/${file}${suffix}.md`, { responseType: 'text' });
  }
}
