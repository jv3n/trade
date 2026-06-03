import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslatePipe } from '@ngx-translate/core';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import {
  DEFAULT_SCREENER_FILTER,
  ScreenerFilter,
} from '../../core/api/screener/screener.repository';

/**
 * Debounce on filter form changes — 300 ms sweet spot used elsewhere in the app (e.g. watchlist
 * symbol search). Short enough that the table responds while the user is still in the panel, long
 * enough to skip in-between strokes when scrubbing numeric inputs.
 */
const FILTER_CHANGE_DEBOUNCE_MS = 300;

/**
 * Filter panel for the market radar after Phase 6 ticket (8) v0.5 simplification — only the two
 * axes the user can meaningfully tweak on the persisted snapshot remain : **gap %** and **volume
 * ratio**. The previously-exposed cap range + sector knobs were dropped because (a) the universe
 * is hardcoded to NASDAQ_MID_CAP so the cap range is enforced server-side, (b) sector is no-op on
 * every live provider (FMP / Polygon don't carry it), and (c) the ticket's UX intent was « strict
 * nécessaire ».
 *
 * **Why a separate component** : the radar page reads as filter (left) + table (right). The
 * filter form, even slim, stays extractable for unit testing without bringing in `mat-table` and
 * the HTTP repository.
 *
 * **Initial value via [input.required<ScreenerFilter>]** — parent owns the persisted filter
 * (locally cached in `localStorage`) and seeds this panel on construction. We snapshot the input
 * once into the FormGroup at the first effect run ; subsequent emissions flow *outwards* via
 * [filterChanged]. The input is **not** a two-way binding — a future re-seed (e.g. the « Reset »
 * button at the page level) is handled by re-rendering the panel.
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

  /** Initialised once in the constructor effect — see class KDoc. */
  form!: FormGroup;

  constructor() {
    let seeded = false;
    effect(() => {
      const seed = this.initial();
      if (seeded) return;
      seeded = true;
      this.form = this.fb.group({
        gapPctMin: [seed.gapPctMin],
        volumeRatioMin: [seed.volumeRatioMin],
      });
      this.form.valueChanges
        .pipe(
          debounceTime(FILTER_CHANGE_DEBOUNCE_MS),
          distinctUntilChanged(
            (a, b) => a.gapPctMin === b.gapPctMin && a.volumeRatioMin === b.volumeRatioMin,
          ),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe((value) => this.emit(value));
    });
  }

  private emit(formValue: { gapPctMin: number | null; volumeRatioMin: number | null }): void {
    // The form value is `null` when the input is empty (Material number input). For the floor
    // knobs we coerce to the default rather than 0 so an empty input feels like "use the floor"
    // rather than "drop the floor entirely" (which would flood the radar with noise).
    this.filterChanged.emit({
      gapPctMin: formValue.gapPctMin ?? DEFAULT_SCREENER_FILTER.gapPctMin,
      volumeRatioMin: formValue.volumeRatioMin ?? DEFAULT_SCREENER_FILTER.volumeRatioMin,
    });
  }

  reset(): void {
    this.resetRequested.emit();
  }
}
