/**
 * Tests on [AccessControlPage] — single-purpose admin page that edits the
 * `app.allowed.emails` runtime config slot.
 *
 * What we pin :
 *
 * - **Load path** : on mount, the page reads the current entry from [ConfigRepository.list] and
 *   splits the CSV into a sorted, lowercased, deduplicated chip list. A load error renders an
 *   inline banner instead of crashing the admin into a blank screen.
 * - **Open-mode banner** when the effective list is empty — silently being in open mode would be a
 *   foot-gun ; the page must shout that gating is OFF.
 * - **Add / remove path** : adding a valid email appends to the list (sorted), adding a malformed
 *   token (no `@`) surfaces an inline error without mutating the list, removing a chip drops it.
 * - **Save path** : non-empty list → PUT with CSV ; empty list → DELETE (falls back to YAML
 *   default = open mode). The asymmetry matters — the backend rejects a blank PUT, so the empty
 *   case must route to reset instead. Pinning this so a future refactor that uses `set` for both
 *   paths doesn't silently 400 on an admin trying to clear the list.
 * - **Reset button** : explicit "wipe back to default" path, separate from saving an emptied
 *   list — the admin can keep typing without losing chips just because they wanted to revert.
 */
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import {
  ConfigEntry,
  ConfigRepository,
  TestConfigResult,
} from '../../../core/api/config/config.repository';
import { AccessControlPage } from './access-control';

const ALLOWED_EMAILS_KEY = 'app.allowed.emails';

class StubConfigRepository implements ConfigRepository {
  listResponse: Observable<ConfigEntry[]> = of([]);
  setCalls: { key: string; value: string }[] = [];
  resetCalls: string[] = [];
  setShouldError = false;
  resetShouldError = false;

  list(): Observable<ConfigEntry[]> {
    return this.listResponse;
  }

  set(key: string, value: string): Observable<ConfigEntry> {
    this.setCalls.push({ key, value });
    if (this.setShouldError) return throwError(() => new Error('boom'));
    return of(emailsEntry(value));
  }

  reset(key: string): Observable<void> {
    this.resetCalls.push(key);
    if (this.resetShouldError) return throwError(() => new Error('boom'));
    return of(undefined);
  }

  testTwelveData(): Observable<TestConfigResult> {
    return of({ ok: true, message: '' });
  }
  testFinnhub(): Observable<TestConfigResult> {
    return of({ ok: true, message: '' });
  }
  testPolygon(): Observable<TestConfigResult> {
    return of({ ok: true, message: '' });
  }
  testFmp(): Observable<TestConfigResult> {
    return of({ ok: true, message: '' });
  }
  testAnthropic(): Observable<TestConfigResult> {
    return of({ ok: true, message: '' });
  }
  testLlm(): Observable<TestConfigResult> {
    return of({ ok: true, message: '' });
  }
}

function emailsEntry(currentValue: string): ConfigEntry {
  return {
    key: ALLOWED_EMAILS_KEY,
    // The backend returns `EMAILS` for this key (cf. `ConfigKeys.EMAIL_LIST_KEYS`) ; the test uses
    // `STRING` here because the page doesn't branch on type — it just reads `currentValue` and
    // writes via the generic ConfigRepository contract. Pinning that the page is type-agnostic on
    // the read.
    type: 'STRING',
    currentValue,
    defaultValue: '',
    hasValue: currentValue.length > 0,
    isOverridden: currentValue.length > 0,
    allowedValues: null,
  };
}

function setup(initial: ConfigEntry | null = null): {
  repo: StubConfigRepository;
} {
  const repo = new StubConfigRepository();
  repo.listResponse = of(initial ? [emailsEntry(initial.currentValue ?? '')] : []);
  TestBed.configureTestingModule({
    imports: [AccessControlPage],
    providers: [
      provideTranslateService({ lang: 'en' }),
      // `useValue` is safe today because `ConfigRepository` is an abstract class with only
      // abstract method declarations — no concrete builders that `useValue` would silently
      // strip. If the port ever grows resource builders (cf. `angular-signals/SKILL.md` pilot on
      // `SnapshotRepository`), switch to `useClass: StubConfigRepository` with the stub fields
      // mutated via a TestBed.inject in each `it()`, so the inherited concrete methods carry
      // through. Pinning the rationale here so a future reviewer doesn't trip on the divergence.
      { provide: ConfigRepository, useValue: repo },
    ],
  });
  return { repo };
}

describe('AccessControlPage', () => {
  it('renders the open-mode banner when no email is configured', () => {
    setup();
    const fixture = TestBed.createComponent(AccessControlPage);
    fixture.detectChanges();
    const html = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(html).toContain('settings.accessControlPage.openModeNote');
    // The admin-auto-included note is always visible — that one belongs to both modes
    expect(html).toContain('settings.accessControlPage.adminNote');
  });

  it('hides the open-mode banner once at least one email is configured', () => {
    setup(emailsEntry('alice@example.com,bob@example.com'));
    const fixture = TestBed.createComponent(AccessControlPage);
    fixture.detectChanges();
    const html = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(html).not.toContain('settings.accessControlPage.openModeNote');
    expect(html).toContain('alice@example.com');
    expect(html).toContain('bob@example.com');
  });

  it('parses, lowercases and sorts the CSV from the backend', () => {
    setup(emailsEntry(' Bob@Example.com , ALICE@example.com , bob@example.com '));
    const fixture = TestBed.createComponent(AccessControlPage);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    expect(cmp.emails()).toEqual(['alice@example.com', 'bob@example.com']);
  });

  it('renders the load-error banner when ConfigRepository.list fails', () => {
    const repo = new StubConfigRepository();
    repo.listResponse = throwError(() => new Error('boom'));
    TestBed.configureTestingModule({
      imports: [AccessControlPage],
      providers: [
        provideTranslateService({ lang: 'en' }),
        { provide: ConfigRepository, useValue: repo },
      ],
    });
    const fixture = TestBed.createComponent(AccessControlPage);
    fixture.detectChanges();
    const html = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(html).toContain('settings.accessControlPage.errors.load');
  });

  // ------------------------------------------------------------------------ add / remove

  it('adds a valid email and returns true so the template can clear the input', () => {
    const { repo } = setup();
    const fixture = TestBed.createComponent(AccessControlPage);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;

    const added = cmp.addCandidate('alice@example.com');

    expect(added).toBe(true);
    expect(cmp.emails()).toEqual(['alice@example.com']);
    expect(cmp.invalidInput()).toBeNull();
    // No save side effect — adding only mutates the local signal
    expect(repo.setCalls).toEqual([]);
  });

  it('rejects an email that does not contain @ and surfaces an inline error', () => {
    const { repo } = setup();
    const fixture = TestBed.createComponent(AccessControlPage);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;

    const added = cmp.addCandidate('not-an-email');

    // The template uses the return value to decide whether to clear the input — false means
    // "keep the typed value visible so the user can fix the typo".
    expect(added).toBe(false);
    expect(cmp.emails()).toEqual([]);
    expect(cmp.invalidInput()).toBe('not-an-email');
    expect(repo.setCalls).toEqual([]);
  });

  it('deduplicates when the same email is added twice (case-insensitive)', () => {
    setup(emailsEntry('alice@example.com'));
    const fixture = TestBed.createComponent(AccessControlPage);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;

    cmp.addCandidate('ALICE@Example.com');

    expect(cmp.emails()).toEqual(['alice@example.com']);
  });

  it('returns true on a blank value without mutating the list (template no-op clear)', () => {
    setup(emailsEntry('alice@example.com'));
    const fixture = TestBed.createComponent(AccessControlPage);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;

    const added = cmp.addCandidate('   ');

    expect(added).toBe(true);
    expect(cmp.emails()).toEqual(['alice@example.com']);
    expect(cmp.invalidInput()).toBeNull();
  });

  // ------------------------------------------------------------------------ DOM-clear handlers
  // The template delegates the "clear the input on success, keep the value on failure" decision
  // to `onAddKeydown` / `onAddClick`. Pinning the DOM-clear behaviour explicitly so a future
  // refactor that flips the condition (e.g. clearing unconditionally) doesn't silently start
  // wiping the admin's typo before they can read the inline error.

  it('onAddClick clears the input element when addCandidate accepts the value', () => {
    setup();
    const fixture = TestBed.createComponent(AccessControlPage);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;

    const input = { value: 'alice@example.com' } as HTMLInputElement;
    cmp.onAddClick(input);

    expect(input.value).toBe('');
    expect(cmp.emails()).toEqual(['alice@example.com']);
  });

  it('onAddClick keeps the typed value when addCandidate rejects (no @)', () => {
    // Critical UX invariant : an admin who fat-fingers `alice@@@example.com` or types just `alice`
    // must see their typo + the inline error, not a blank input with a vanished value.
    setup();
    const fixture = TestBed.createComponent(AccessControlPage);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;

    const input = { value: 'not-an-email' } as HTMLInputElement;
    cmp.onAddClick(input);

    expect(input.value).toBe('not-an-email');
    expect(cmp.emails()).toEqual([]);
    expect(cmp.invalidInput()).toBe('not-an-email');
  });

  it('onAddKeydown clears the input and calls preventDefault on success', () => {
    setup();
    const fixture = TestBed.createComponent(AccessControlPage);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;

    let prevented = false;
    const target = { value: 'alice@example.com' } as HTMLInputElement;
    const event = {
      target,
      preventDefault: () => {
        prevented = true;
      },
    } as unknown as Event;

    cmp.onAddKeydown(event, target.value);

    // preventDefault always fires (suppresses a hypothetical form-submit) even when the value
    // turns out invalid — pin that side-effect so a refactor that conditionalises it doesn't
    // silently re-enable form-submits.
    expect(prevented).toBe(true);
    expect(target.value).toBe('');
    expect(cmp.emails()).toEqual(['alice@example.com']);
  });

  it('onAddKeydown keeps the typed value and still calls preventDefault on a rejected value', () => {
    setup();
    const fixture = TestBed.createComponent(AccessControlPage);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;

    let prevented = false;
    const target = { value: 'not-an-email' } as HTMLInputElement;
    const event = {
      target,
      preventDefault: () => {
        prevented = true;
      },
    } as unknown as Event;

    cmp.onAddKeydown(event, target.value);

    expect(prevented).toBe(true);
    expect(target.value).toBe('not-an-email');
    expect(cmp.invalidInput()).toBe('not-an-email');
  });

  it('removes an email from the local list when removeEmail is called', () => {
    setup(emailsEntry('alice@example.com,bob@example.com'));
    const fixture = TestBed.createComponent(AccessControlPage);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;

    cmp.removeEmail('alice@example.com');

    expect(cmp.emails()).toEqual(['bob@example.com']);
  });

  // ------------------------------------------------------------------------ save / reset

  it('save with a non-empty list PUTs the CSV via ConfigRepository.set', () => {
    const { repo } = setup(emailsEntry('alice@example.com,bob@example.com'));
    const fixture = TestBed.createComponent(AccessControlPage);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;

    cmp.save();

    expect(repo.setCalls).toEqual([
      { key: ALLOWED_EMAILS_KEY, value: 'alice@example.com,bob@example.com' },
    ]);
    expect(repo.resetCalls).toEqual([]);
    expect(cmp.saved()).toBe(true);
    expect(cmp.saveError()).toBe(false);
  });

  it('save with an empty list goes through ConfigRepository.reset instead of set', () => {
    // The backend rejects PUT with a blank value (use DELETE to clear) — clicking Save on an
    // emptied chip list must therefore route to reset. Pinning this so a future refactor that
    // unifies the two paths doesn't silently 400 on an admin trying to clear the list.
    const { repo } = setup();
    const fixture = TestBed.createComponent(AccessControlPage);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;

    cmp.save();

    expect(repo.setCalls).toEqual([]);
    expect(repo.resetCalls).toEqual([ALLOWED_EMAILS_KEY]);
  });

  it('surfaces an inline save error when the backend rejects the save', () => {
    const { repo } = setup(emailsEntry('alice@example.com'));
    repo.setShouldError = true;
    const fixture = TestBed.createComponent(AccessControlPage);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;

    cmp.save();

    expect(cmp.saveError()).toBe(true);
    expect(cmp.saved()).toBe(false);
  });

  it('reset button always calls ConfigRepository.reset and reloads the list', () => {
    const { repo } = setup(emailsEntry('alice@example.com,bob@example.com'));
    // Reset should reload the entry — so the new listResponse returned post-reset must be the
    // empty state to simulate "fell back to YAML default = empty"
    const fixture = TestBed.createComponent(AccessControlPage);
    fixture.detectChanges();

    // Swap the listResponse so the post-reset reload returns empty
    repo.listResponse = of([emailsEntry('')]);
    fixture.componentInstance.reset();

    expect(repo.resetCalls).toEqual([ALLOWED_EMAILS_KEY]);
    expect(fixture.componentInstance.emails()).toEqual([]);
  });
});
