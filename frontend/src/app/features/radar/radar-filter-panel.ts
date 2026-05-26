import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslatePipe } from '@ngx-translate/core';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import {
  DEFAULT_SCREENER_FILTER,
  ScreenerFilter,
} from '../../core/api/screener/screener.repository';

/**
 * Debounce on filter form changes — same 300 ms sweet spot used elsewhere in the app (e.g.
 * watchlist symbol search). Short enough that the table responds while the user is still in the
 * panel, long enough to skip in-between strokes when sliding numeric inputs.
 */
const FILTER_CHANGE_DEBOUNCE_MS = 300;

/** Sector options surfaced in the dropdown. Empty string maps back to `null` (no filter). */
const SECTOR_OPTIONS = [
  'Technology',
  'Financial Services',
  'Communication Services',
  'Consumer Cyclical',
  'Real Estate',
  'Healthcare',
  'Energy',
  'Industrials',
  'Consumer Defensive',
  'Basic Materials',
  'Utilities',
];

/**
 * Filter panel for the market radar. Hosts the editable knobs (gap %, volume ratio, optional cap
 * range, sector) and emits the consolidated `ScreenerFilter` upstream every time the user changes
 * a value — debounced 300 ms so slider drags don't flood the backend.
 *
 * **Why a separate component** : the radar page reads as filter (left) + table (right). The
 * filter form is the densest stateful piece of the screen — extracting it keeps `RadarPage`
 * focused on orchestration (fetch / loading / error / empty) and makes the form independently
 * unit-testable without bringing in `mat-table` and the HTTP repository.
 *
 * **Initial value via [input.required<ScreenerFilter>]** — parent owns the persisted filter (lo-
 * cally cached in `localStorage`) and seeds this panel on construction. We snapshot the input
 * once into the FormGroup at the first effect run ; subsequent emissions flow *outwards* via
 * [filterChanged]. The input is **not** a two-way binding — a future re-seed (e.g. a "Reset to
 * defaults" button at the page level) is handled by re-rendering the panel, not by reactive
 * sync.
 */
@Component({
  selector: 'app-radar-filter-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    TranslatePipe,
  ],
  templateUrl: './radar-filter-panel.html',
  styleUrl: './radar-filter-panel.scss',
})
export class RadarFilterPanel {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  /** The filter currently in effect — seeded from the parent's persisted value. */
  readonly initial = input.required<ScreenerFilter>();

  /** Fires every time the user adjusts a knob (debounced). */
  readonly filterChanged = output<ScreenerFilter>();
  /** Fires when the user hits « Reset to defaults ». */
  readonly resetRequested = output<void>();

  readonly sectorOptions = SECTOR_OPTIONS;

  /** Initialised once in the constructor effect — see class KDoc. */
  form!: FormGroup;

  constructor() {
    // We need the value of `initial()` to build the FormGroup. `input.required` is read inside an
    // effect so the panel can be constructed eagerly while the parent's seed lands shortly after.
    // The `seeded` guard ensures we only build the form once — later input emissions don't reset
    // the user's in-flight edits.
    let seeded = false;
    effect(() => {
      const seed = this.initial();
      if (seeded) return;
      seeded = true;
      this.form = this.fb.group({
        gapPctMin: [seed.gapPctMin],
        volumeRatioMin: [seed.volumeRatioMin],
        marketCapMin: [seed.marketCapMin],
        marketCapMax: [seed.marketCapMax],
        sector: [seed.sector ?? ''],
      });
      this.form.valueChanges
        .pipe(
          debounceTime(FILTER_CHANGE_DEBOUNCE_MS),
          distinctUntilChanged(
            (a, b) =>
              a.gapPctMin === b.gapPctMin &&
              a.volumeRatioMin === b.volumeRatioMin &&
              a.marketCapMin === b.marketCapMin &&
              a.marketCapMax === b.marketCapMax &&
              a.sector === b.sector,
          ),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe((value) => this.emit(value));
    });
  }

  private emit(formValue: {
    gapPctMin: number | null;
    volumeRatioMin: number | null;
    marketCapMin: number | null;
    marketCapMax: number | null;
    sector: string | null;
  }): void {
    // The form value is `null` when the input is empty (Material number input). For the floor
    // knobs we coerce to the default rather than 0 so an empty input feels like "use the floor"
    // rather than "drop the floor entirely" (which would flood the radar with noise).
    this.filterChanged.emit({
      gapPctMin: formValue.gapPctMin ?? DEFAULT_SCREENER_FILTER.gapPctMin,
      volumeRatioMin: formValue.volumeRatioMin ?? DEFAULT_SCREENER_FILTER.volumeRatioMin,
      marketCapMin: formValue.marketCapMin,
      marketCapMax: formValue.marketCapMax,
      exchange: null,
      sector: formValue.sector && formValue.sector.length > 0 ? formValue.sector : null,
    });
  }

  reset(): void {
    this.resetRequested.emit();
  }
}
