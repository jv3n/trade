import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, maxLength, required } from '@angular/forms/signals';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import {
  StbButtonModule,
  StbDialogModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
} from '@portfolioai/ui';
import { LexiconEntry, LexiconEntryInput } from '../../../core/api/lexicon/lexicon.model';

/** Data passed to the dialog — `entry` non-null = edit mode, null = create mode. */
export interface LexiconDialogData {
  entry: LexiconEntry | null;
}

interface LexiconFormModel {
  term: string;
  definitionFr: string;
  definitionEn: string;
}

/**
 * Add / edit dialog for a lexicon entry — built on **Signal Forms** (same convention as the
 * journal's `AddTradeDialog`). Three required text fields (term + FR + EN definition) ; returns the
 * domain [LexiconEntryInput] on close (the adapter trims on the way to the wire).
 */
@Component({
  selector: 'app-lexicon-dialog',
  imports: [
    FormField,
    StbButtonModule,
    StbDialogModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    TranslatePipe,
  ],
  templateUrl: './lexicon-dialog.html',
  styleUrl: './lexicon-dialog.scss',
})
export class LexiconDialog {
  private readonly dialogRef =
    inject<MatDialogRef<LexiconDialog, LexiconEntryInput | undefined>>(MatDialogRef);
  private readonly data = inject<LexiconDialogData>(MAT_DIALOG_DATA);

  readonly isEdit = computed(() => this.data.entry !== null);

  readonly model = signal<LexiconFormModel>({
    term: this.data.entry?.term ?? '',
    definitionFr: this.data.entry?.definitionFr ?? '',
    definitionEn: this.data.entry?.definitionEn ?? '',
  });

  readonly lexiconForm = form(this.model, (path) => {
    required(path.term);
    maxLength(path.term, 120);
    required(path.definitionFr);
    required(path.definitionEn);
  });

  submit(): void {
    if (!this.lexiconForm().valid()) {
      this.lexiconForm().markAsTouched();
      return;
    }
    const v = this.model();
    this.dialogRef.close({
      term: v.term,
      definitionFr: v.definitionFr,
      definitionEn: v.definitionEn,
    });
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
