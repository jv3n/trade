import { Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { TranslatePipe } from '@ngx-translate/core';
import {
  StbButtonModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
  StbTooltipModule,
} from '@portfolioai/ui';
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

/** localStorage key for the sidenav rail open/collapsed state. Persists per browser. */
const SIDENAV_STORAGE_KEY = 'radar-sidenav-open';
/** localStorage key for the expanded accordion sections — JSON-encoded array of section keys. */
const SIDENAV_SECTIONS_STORAGE_KEY = 'radar-filter-sections';

/** Section keys for the filter accordion — closed type so a typo in the template fails at build. */
type SidenavSectionKey = 'gap' | 'volume';

const ALL_SECTIONS: SidenavSectionKey[] = ['gap', 'volume'];

/**
 * Filter panel for the market radar — same chrome as the ticker dossier's tools sidenav :
 *   - foldable rail (full content + collapsed icon-only rail), persisted in localStorage ;
 *   - accordion sections — one per filter axis (gap %, volume ratio), each with its own
 *     header button + chevron + collapsible body ;
 *   - reset button pinned to the footer.
 *
 * **State** :
 *   - [initial] (input) — seed value from the parent's localStorage cache, snapshotted once into
 *     the FormGroup at the first effect run. Not a two-way binding ; a re-seed (e.g. parent
 *     reset) is handled by re-rendering the panel.
 *   - [sidenavOpen] (signal) — controls the rail collapse. Defaults open ; persists user toggles.
 *   - [expandedSections] (signal) — accordion state. Defaults both open (the panel IS the radar's
 *     filter UI ; defaulting closed would land the user on a blank rail).
 *
 * **Why a separate component** : the radar page reads as filter (left) + table (right). The
 * filter panel stays extractable for unit testing without bringing in `mat-table` and the HTTP
 * repository.
 */
@Component({
  selector: 'app-radar-filter-panel',
  imports: [
    ReactiveFormsModule,
    StbButtonModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    StbTooltipModule,
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

  /** Sidenav rail open / collapsed. */
  readonly sidenavOpen = signal<boolean>(RadarFilterPanel.loadSidenavOpenInitial());
  /** Accordion sections currently expanded. */
  readonly expandedSections = signal<Set<SidenavSectionKey>>(
    RadarFilterPanel.loadExpandedSectionsInitial(),
  );

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

  toggleSidenav(): void {
    const next = !this.sidenavOpen();
    this.sidenavOpen.set(next);
    try {
      localStorage.setItem(SIDENAV_STORAGE_KEY, String(next));
    } catch {
      /* localStorage unavailable — in-memory state still works for the session */
    }
  }

  isSectionExpanded(key: SidenavSectionKey): boolean {
    return this.expandedSections().has(key);
  }

  toggleSection(key: SidenavSectionKey): void {
    const next = new Set(this.expandedSections());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.expandedSections.set(next);
    try {
      localStorage.setItem(SIDENAV_SECTIONS_STORAGE_KEY, JSON.stringify(Array.from(next)));
    } catch {
      /* localStorage unavailable — in-memory state still works for the session */
    }
  }

  // Default open : the filter panel IS the radar's filter UI ; defaulting closed would land the
  // user on an empty rail.
  private static loadSidenavOpenInitial(): boolean {
    try {
      const raw = localStorage.getItem(SIDENAV_STORAGE_KEY);
      return raw === null ? true : raw === 'true';
    } catch {
      return true;
    }
  }

  // Default = both sections open. Falls back to a clean default if the stored JSON is malformed
  // (defensive : a stale entry from a previous schema shouldn't crash the page).
  private static loadExpandedSectionsInitial(): Set<SidenavSectionKey> {
    try {
      const raw = localStorage.getItem(SIDENAV_SECTIONS_STORAGE_KEY);
      if (raw === null) return new Set(ALL_SECTIONS);
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return new Set(ALL_SECTIONS);
      return new Set(
        parsed.filter((k): k is SidenavSectionKey => ALL_SECTIONS.includes(k as SidenavSectionKey)),
      );
    } catch {
      return new Set(ALL_SECTIONS);
    }
  }
}
