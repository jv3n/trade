import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { StbDanger } from '../button/button.directives';

/** `default` = accent confirm button (creations, copies) ; `danger` = red button (deletions). */
export type StbConfirmVariant = 'default' | 'danger';

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
  imports: [MatButtonModule, MatDialogModule, MatIconModule, StbDanger],
  template: `
    <div class="confirm-body">
      <span class="confirm-icon" aria-hidden="true">
        <mat-icon>{{ icon() }}</mat-icon>
      </span>
      <div>
        <h2 mat-dialog-title class="confirm-title">{{ data.title }}</h2>
        <p class="confirm-message">{{ data.message }}</p>
      </div>
    </div>
    <div class="confirm-actions">
      <button mat-stroked-button type="button" mat-dialog-close>{{ data.cancelLabel }}</button>
      @if (danger()) {
        <button mat-flat-button stbDanger type="button" [mat-dialog-close]="true">
          {{ data.confirmLabel }}
        </button>
      } @else {
        <button mat-flat-button type="button" [mat-dialog-close]="true">
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
}
