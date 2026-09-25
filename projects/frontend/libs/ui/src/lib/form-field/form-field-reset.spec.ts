import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { StbInputModule } from '../input';
import { StbFormFieldResetIntl } from './form-field-reset-intl';
import { StbFormFieldModule } from './form-field.module';

/**
 * The ✕ suffix that empties the field it points at. What is pinned here is the contract the app
 * leans on at ~45 call sites :
 *
 *  - **It appears only when there is something to clear** — an untouched form shows no ✕ at all,
 *    and a field the user cannot edit — disabled or read-only — offers none either.
 *  - **It clears through the DOM, not through a model** — the value is emptied on the element and
 *    an `input` + `change` pair is dispatched, which is the only thing every binding shape in the
 *    app has in common (Signal Forms, the number mask, plain `[value]` + `(input)`).
 *  - **The focus never leaves the field** — a click on the ✕ does not blur it, so a form that saves
 *    on blur (the stats sheet) never stores the old value on the way.
 *  - **The wording is the app's** — the lib ships an English default in `StbFormFieldResetIntl`.
 */
@Component({
  selector: 'ui-reset-host',
  imports: [StbFormFieldModule, StbInputModule],
  template: `
    <mat-form-field>
      <mat-label>Ticker</mat-label>
      <input
        #ticker
        matInput
        [value]="value()"
        [disabled]="disabled()"
        [readonly]="readonly()"
        (input)="value.set($any($event.target).value)"
      />
      <ui-form-field-reset matIconSuffix [for]="ticker" (cleared)="clears.set(clears() + 1)" />
    </mat-form-field>
  `,
})
class Host {
  readonly value = signal('');
  readonly disabled = signal(false);
  readonly readonly = signal(false);
  readonly clears = signal(0);
}

describe('StbFormFieldReset', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const button = () => fixture.nativeElement.querySelector('[data-testid="reset"]');
  const field = (): HTMLInputElement => fixture.nativeElement.querySelector('input');

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await settle();
  });

  it('stays out of the way while the field is empty', () => {
    expect(button()).toBeNull();
  });

  it('appears as soon as the field holds something', async () => {
    host.value.set('KTTA');
    await settle();

    expect(button()).not.toBeNull();
  });

  it('offers nothing on a disabled field, even a filled one', async () => {
    host.value.set('KTTA');
    host.disabled.set(true);
    await settle();

    expect(button()).toBeNull();
  });

  it('offers nothing on a read-only field either', async () => {
    host.value.set('KTTA');
    host.readonly.set(true);
    await settle();

    expect(button()).toBeNull();
  });

  // The stats sheet saves on blur : a ✕ that took the focus would store the old value first.
  it('keeps the focus in the field when pressed', async () => {
    host.value.set('KTTA');
    await settle();

    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    button().dispatchEvent(press);

    expect(press.defaultPrevented).toBe(true);
  });

  it('empties the field and tells its binding about it', async () => {
    host.value.set('KTTA');
    await settle();

    button().click();
    await settle();

    expect(field().value).toBe('');
    // The `(input)` handler of the host ran — which is what Signal Forms and the number mask
    // listen to as well.
    expect(host.value()).toBe('');
  });

  it('gives the focus back to the field, and hides itself again', async () => {
    host.value.set('KTTA');
    await settle();

    button().click();
    await settle();

    expect(fixture.nativeElement.ownerDocument.activeElement).toBe(field());
    expect(button()).toBeNull();
  });

  it('emits once per clear', async () => {
    host.value.set('KTTA');
    await settle();

    button().click();
    await settle();

    expect(host.clears()).toBe(1);
  });

  it('takes its accessible name from the intl service the app overrides', async () => {
    TestBed.inject(StbFormFieldResetIntl).resetField.set('Vider le champ');
    host.value.set('KTTA');
    await settle();

    expect(button().getAttribute('aria-label')).toBe('Vider le champ');
  });
});
