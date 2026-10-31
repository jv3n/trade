import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { StbDanger } from '../button/button.directives';

/** `default` = accent confirm button (creations, copies) ; `danger` = red button (deletions). */
export type StbConfirmVariant = 'default' | 'danger';

/**
 * An optional pick under the message — a reason, a category. The dialog adds an empty « — » first
 * entry : picking nothing is always allowed.
 */
export interface StbConfirmChoice {
  label: string;
  options: readonly { value: string; label: string }[];
  /** An optional free text under the pick : the case it only names. */
  note?: { label: string; placeholder: string; maxLength: number };
}

/**
 * What a confirmation with a [StbConfirmChoice] closes with : the pick and the note on confirm,
 * trimmed, null for none.
 */
export type StbConfirmPick =
  { confirmed: false } | { confirmed: true; value: string | null; note: string | null };

/**
 * Texts and variant of a [StbConfirmDialog]. The lib has no i18n : every string arrives
 * **already translated** from the consumer (the app routes them through ngx-translate).
 */
export interface StbConfirmDialogData {
  /** The question, e.g. "Delete the KTTA trade of 09/17?". */
  title: string;
  /** The consequence — what is copied, what disappears. */
  message: string;
  /** Label of the confirm button — the action itself ("Delete the trade"), not a bare "OK". */
  confirmLabel: string;
  cancelLabel: string;
  variant?: StbConfirmVariant;
  /** Material Symbols ligature ; defaults to `help` (default) / `delete` (danger). */
  icon?: string;
  /** Open it through [StbConfirm.choose], which reads the pick back. */
  choice?: StbConfirmChoice;
}

/**
 * Confirmation modal for every action that creates or deletes something (cf. `mockup/PARCOURS.md
 * › Principes d'interface`) — icon tile, title, consequence text, Cancel + confirm button.
 *
 * Closes with `true` on confirm only ; Cancel, Esc and a backdrop click all close with
 * `undefined`, so the caller acts only on an explicit confirmation. Initial focus lands on
 * Cancel (first tabbable element) so a stray Enter never confirms a deletion. Open it through
 * [StbConfirm], which maps the result to a boolean.
 */
@Component({
  selector: 'ui-confirm-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    StbDanger,
  ],
  template: `
    <div class="confirm-body">
      <span class="confirm-icon" aria-hidden="true">
        <mat-icon>{{ icon() }}</mat-icon>
      </span>
      <div>
        <h2 mat-dialog-title class="confirm-title">{{ data.title }}</h2>
        <p class="confirm-message">{{ data.message }}</p>
        @if (data.choice; as choice) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="confirm-choice">
            <mat-label>{{ choice.label }}</mat-label>
            <mat-select [value]="picked()" (selectionChange)="picked.set($event.value)">
              <mat-option [value]="null">—</mat-option>
              @for (option of choice.options; track option.value) {
                <mat-option [value]="option.value">{{ option.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          @if (choice.note; as note) {
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="confirm-choice">
              <mat-label>{{ note.label }}</mat-label>
              <textarea
                matInput
                rows="3"
                [maxLength]="note.maxLength"
                [placeholder]="note.placeholder"
                [value]="noted()"
                (input)="noted.set($any($event.target).value)"
              ></textarea>
            </mat-form-field>
          }
        }
      </div>
    </div>
    <div class="confirm-actions">
      <button mat-stroked-button type="button" mat-dialog-close>{{ data.cancelLabel }}</button>
      @if (danger()) {
        <button mat-flat-button stbDanger type="button" [mat-dialog-close]="result()">
          {{ data.confirmLabel }}
        </button>
      } @else {
        <button mat-flat-button type="button" [mat-dialog-close]="result()">
          {{ data.confirmLabel }}
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .confirm-body {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 14px;
      padding: 20px 22px 8px;
    }

    .confirm-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: var(--color-accent-soft);
      color: var(--color-accent);
    }

    :host(.danger) .confirm-icon {
      background: var(--color-danger-soft);
      color: var(--color-danger);
    }

    /* mat-dialog-title wires the dialog's aria-labelledby ; its MDC headline padding and
       baseline ::before strut are reset so the title sits in the icon grid like the mockup. */
    .confirm-title.mat-mdc-dialog-title {
      margin: 6px 0;
      padding: 0;
      font-size: 16px;
      font-weight: 600;
      line-height: 1.4;
      color: var(--color-text);
    }

    .confirm-title.mat-mdc-dialog-title::before {
      display: none;
    }

    .confirm-message {
      margin: 0;
      color: var(--color-text-muted);
    }

    .confirm-choice {
      width: 100%;
      margin-top: 14px;
    }

    .confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 16px 22px 18px;
    }
  `,
  host: {
    '[class.danger]': 'danger()',
  },
})
export class StbConfirmDialog {
  protected readonly data = inject<StbConfirmDialogData>(MAT_DIALOG_DATA);

  protected readonly danger = computed(() => this.data.variant === 'danger');
  protected readonly icon = computed(() => this.data.icon ?? (this.danger() ? 'delete' : 'help'));
  protected readonly picked = signal<string | null>(null);
  protected readonly noted = signal('');
  /** `true`, or the pick when there is a choice — Cancel, Esc and the backdrop leave `undefined`. */
  protected readonly result = computed(() =>
    this.data.choice ? { value: this.picked(), note: this.noted().trim() || null } : true,
  );
}
