import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, booleanAttribute, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, map, of } from 'rxjs';
import { PatternsRepository } from '../../../core/api/patterns/patterns.repository';
import { LanguageService } from '../../../core/app-state/language.service';
import { PricePipe } from '../../../shared/price/price.pipe';
import { parseSheet, sheetAnchor } from '../../patterns/sheet';
import { CalculatorStore } from '../calculator.store';
import { CalcField } from './calc-field';

const NOTE = { shelf: 'notes', file: 'tradezero-margin' } as const;

/**
 * The broker rules the sizing cards model (#496) — leverage, margin floor per share, lot, safety
 * margin — folded under a line that gives the values in use. One set for both cards, editable :
 * the broker changes them, and the note they link to says where each one comes from.
 */
@Component({
  selector: 'app-calc-broker',
  imports: [CalcField, DatePipe, DecimalPipe, PricePipe, RouterLink, TranslatePipe],
  template: `
    @let v = store.values();
    <details>
      <summary>
        {{ 'calculator.broker.title' | translate }}
        <span class="broker__line">
          · {{ 'calculator.broker.leverage' | translate }} {{ v.leverage ?? '—' }} ·
          {{ v.marginFloor !== null ? (v.marginFloor | price) : '—' }}
          {{ 'calculator.units.perShare' | translate }}
          @if (withLot()) {
            · {{ 'calculator.broker.lot' | translate }} {{ v.lot ?? '—' }}
          }
          · {{ 'calculator.broker.safety' | translate }}
          {{ v.safety !== null ? (v.safety | number: '1.0-1') + ' %' : '—' }}
        </span>
      </summary>
      <div class="calc-row">
        <app-calc-field
          field="leverage"
          label="calculator.broker.leverage"
          decimals="1"
          suffix="calculator.units.times"
        />
        <app-calc-field
          field="marginFloor"
          label="calculator.broker.floor"
          decimals="2"
          suffix="calculator.units.perShare"
        />
      </div>
      <div class="calc-row">
        @if (withLot()) {
          <app-calc-field field="lot" label="calculator.broker.lot" decimals="0" />
        }
        <app-calc-field
          field="safety"
          label="calculator.broker.safety"
          decimals="1"
          suffix="calculator.units.percent"
        />
      </div>
      <p class="broker__note">
        {{ 'calculator.broker.remembered' | translate }}
        <a routerLink="/patterns" [fragment]="noteAnchor">{{
          'calculator.broker.note' | translate
        }}</a>
        @if (noteRevisedOn(); as revised) {
          — {{ 'calculator.broker.checkedOn' | translate: { date: (revised | date: 'shortDate') } }}
        }
      </p>
    </details>
  `,
  styleUrl: './calc-broker.scss',
})
export class CalcBroker {
  protected readonly store = inject(CalculatorStore);

  /** The lot matters to the max size only : the ladder counts shares one by one. */
  readonly withLot = input(false, { transform: booleanAttribute });

  readonly noteAnchor = sheetAnchor(NOTE);
  /** The note's own « Last revised » date : read from the file, so it cannot drift from it. */
  readonly noteRevisedOn = toSignal(
    inject(PatternsRepository)
      .markdown(NOTE.shelf, NOTE.file, inject(LanguageService).lang())
      .pipe(
        map((source) => parseSheet(NOTE, source).revisedOn),
        catchError(() => of(null)),
      ),
    { initialValue: null },
  );
}
