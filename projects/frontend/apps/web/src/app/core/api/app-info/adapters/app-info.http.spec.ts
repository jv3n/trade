import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppVersion } from '../app-info.model';
import { AppInfoRepository } from '../app-info.repository';
import { HttpAppInfoRepository } from './app-info.http';

/**
 * Adapter contract test for [HttpAppInfoRepository] — pins the `/actuator/info` surface and the
 * wire ↔ domain mapping of the release tag, the short commit, the build time and the environment. The commit id
 * comes as an object in the `full` git mode the backend uses, and as a string in `simple`.
 */
describe('HttpAppInfoRepository', () => {
  let repo: AppInfoRepository;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AppInfoRepository, useClass: HttpAppInfoRepository },
      ],
    });
    repo = TestBed.inject(AppInfoRepository);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('reads the release tag, the short commit and the build time', () => {
    let result: AppVersion | null = null;
    repo.version().subscribe((v) => (result = v));

    httpMock.expectOne('/actuator/info').flush({
      environment: 'staging',
      build: { version: 'v2.3.0-rc2', time: '2026-09-23T14:55:12.000Z' },
      git: { commit: { id: { abbrev: '9a4da8b', full: '9a4da8b4d0000000000' } } },
    });

    expect(result!.version).toBe('v2.3.0-rc2');
    expect(result!.commit).toBe('9a4da8b');
    expect(result!.builtAt?.toISOString()).toBe('2026-09-23T14:55:12.000Z');
    expect(result!.environment).toBe('staging');
  });

  it('shortens a commit id given as a plain string', () => {
    let result: AppVersion | null = null;
    repo.version().subscribe((v) => (result = v));

    httpMock.expectOne('/actuator/info').flush({
      build: { version: '0.0.0-SNAPSHOT' },
      git: { commit: { id: '9a4da8b4d0000000000' } },
    });

    expect(result!.commit).toBe('9a4da8b');
    expect(result!.builtAt).toBeNull();
    expect(result!.environment).toBeNull();
  });

  it('reads no version when the build carries none, rather than a blank one', () => {
    // Run from an IDE, `springBoot.buildInfo()` never wrote `build-info.properties` : the payload
    // still has git and the environment, but a heading over an empty line would say nothing.
    let result: AppVersion | null | undefined;
    repo.version().subscribe((v) => (result = v));

    httpMock.expectOne('/actuator/info').flush({
      environment: 'local',
      git: { commit: { id: { abbrev: '8d53fd2' } } },
    });

    expect(result).toBeNull();
  });
});
