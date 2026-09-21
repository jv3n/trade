import { Component, booleanAttribute, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import {
  StbDatePickerModule,
  StbFormFieldModule,
  StbInputModule,
  StbSelectModule,
} from '@portfolioai/ui';
import {
  PERIOD_PRESETS,
  PeriodPresetKey,
  PeriodSelection,
  selectPeriod,
} from '../period-preset/period-preset';

/**
 * The period filter of the list pages (stats, journal, account) : a preset select, and on
 * « custom » the from / to date pickers. Controlled — the page owns the [selection] and applies
 * every [selectionChange] ; a date typed by hand switches the selection to « custom ».
 *
 * The host is `display: contents`, so the fields sit in the page's own toolbar row.
 */
@Component({
  selector: 'app-period-filter',
  imports: [
    StbDatePickerModule,
    StbFormFieldModule,
    StbInputModule,
    StbSelectModule,
    TranslatePipe,
  ],
  templateUrl: './period-filter.html',
  styleUrl: './period-filter.scss',
})
export class PeriodFilter {
  readonly selection = input.required<PeriodSelection>();
  /** Shows the « Period » label above the select — for toolbars whose other fields have one. */
  readonly labelled = input(false, { transform: booleanAttribute });

  readonly selectionChange = output<PeriodSelection>();

  readonly presets = PERIOD_PRESETS;

  pickPreset(key: PeriodPresetKey): void {
    this.selectionChange.emit(selectPeriod(key, this.selection()));
  }

  setDateFrom(dateFrom: Date | null): void {
    this.selectionChange.emit({ ...this.selection(), period: 'custom', dateFrom });
  }

  setDateTo(dateTo: Date | null): void {
    this.selectionChange.emit({ ...this.selection(), period: 'custom', dateTo });
  }
}
