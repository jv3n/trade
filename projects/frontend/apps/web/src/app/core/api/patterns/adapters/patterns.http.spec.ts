/**
 * Pins where [HttpPatternsRepository] reads a sheet from : the Markdown the build copied into the
 * app's assets, as text.
 */
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HttpPatternsRepository } from './patterns.http';

describe('HttpPatternsRepository', () => {
  it('reads a sheet as text from the shipped assets, in English', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpPatternsRepository],
    });
    const http = TestBed.inject(HttpTestingController);
    let markdown: string | undefined;

    TestBed.inject(HttpPatternsRepository)
      .markdown('pattern', 'GUS', 'en')
      .subscribe((m) => (markdown = m));

    const req = http.expectOne('/docs/pattern/GUS.md');
    expect(req.request.responseType).toBe('text');
    req.flush('# Gap Up Short — pattern sheet');
    expect(markdown).toBe('# Gap Up Short — pattern sheet');
    http.verify();
  });

  it('reads the French twin of a sheet in French', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpPatternsRepository],
    });
    const http = TestBed.inject(HttpTestingController);

    TestBed.inject(HttpPatternsRepository).markdown('notes', 'four-sellers', 'fr').subscribe();

    http.expectOne('/docs/notes/four-sellers.fr.md').flush('# Les quatre vendeurs');
    http.verify();
  });
});
