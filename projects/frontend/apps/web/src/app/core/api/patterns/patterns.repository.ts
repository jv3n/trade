import { Observable } from 'rxjs';

/**
 * Port — the pattern sheets and trading notes of `docs/`, as the app build ships them (#419). The
 * raw Markdown of one file of a folder, in the interface language — each file has a French twin
 * (`GUS.fr.md` beside `GUS.md`). The page reads its title, summary and revision date out of it.
 */
export abstract class PatternsRepository {
  abstract markdown(
    folder: 'pattern' | 'notes',
    file: string,
    lang: 'fr' | 'en',
  ): Observable<string>;
}
