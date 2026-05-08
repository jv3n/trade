import { Component, DestroyRef, effect, inject, signal, computed, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { debounceTime, distinctUntilChanged, filter, of, switchMap } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  PortfolioRepository,
  Portfolio,
  Asset,
  OwnedTicker,
} from '../../core/portfolio.repository';
import { MarketRepository, SymbolMatch } from '../../core/market.repository';
import { WatchlistEntry, WatchlistRepository } from '../../core/watchlist.repository';

/**
 * Debounce window between a keystroke in the watchlist search and the actual `/symbols/search`
 * call. 300 ms is the standard "feels instant but doesn't burn calls" sweet spot — short enough
 * that the dropdown opens before the user stops typing, long enough to skip the in-between
 * keystrokes when typing fast.
 */
const WATCHLIST_SEARCH_DEBOUNCE_MS = 300;

/**
 * Persists the user-chosen portfolio order across reloads. JSON-encoded `string[]` of IDs ; absence
 * means "no preference, use server order". Single-user single-device by design — if multi-device
 * matters one day we'd add a `display_order INTEGER` column on `portfolio` and a save endpoint.
 */
const PORTFOLIO_ORDER_STORAGE_KEY = 'portfolio-order';

/**
 * Persists the open/closed state of the three sidebar accordions (portfolios, owned tickers,
 * watchlist) so the user's last layout survives a reload. Single JSON object so we read/write once
 * per change rather than three independent keys. Default is "all open" — a fresh user sees the
 * full dashboard on first visit.
 */
const SIDEBAR_OPEN_STORAGE_KEY = 'dashboard-sidebar-open';

interface SidebarOpenState {
  portfolios: boolean;
  ownedTickers: boolean;
  watchlist: boolean;
}

const SIDEBAR_OPEN_DEFAULT: SidebarOpenState = {
  portfolios: true,
  ownedTickers: true,
  watchlist: true,
};

/**
 * Reads the persisted sidebar accordion state from localStorage. Defensive against missing keys
 * (a sub-object shipped before a new section was added) and corrupt JSON — falls back to
 * [SIDEBAR_OPEN_DEFAULT] in both cases. Per-key fallback (rather than whole-object) so adding a
 * new accordion later doesn't reset the user's choices for the existing ones.
 */
function readSidebarOpenState(): SidebarOpenState {
  try {
    const raw = localStorage.getItem(SIDEBAR_OPEN_STORAGE_KEY);
    if (!raw) return { ...SIDEBAR_OPEN_DEFAULT };
    const parsed = JSON.parse(raw) as Partial<SidebarOpenState>;
    return {
      portfolios:
        typeof parsed.portfolios === 'boolean'
          ? parsed.portfolios
          : SIDEBAR_OPEN_DEFAULT.portfolios,
      ownedTickers:
        typeof parsed.ownedTickers === 'boolean'
          ? parsed.ownedTickers
          : SIDEBAR_OPEN_DEFAULT.ownedTickers,
      watchlist:
        typeof parsed.watchlist === 'boolean' ? parsed.watchlist : SIDEBAR_OPEN_DEFAULT.watchlist,
    };
  } catch {
    return { ...SIDEBAR_OPEN_DEFAULT };
  }
}

@Component({
  selector: 'app-dashboard',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    DragDropModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TranslatePipe,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  private readonly portfolioRepository = inject(PortfolioRepository);
  private readonly watchlistRepository = inject(WatchlistRepository);
  private readonly marketRepository = inject(MarketRepository);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  portfolios = signal<Portfolio[]>([]);
  selectedPortfolio = signal<Portfolio | null>(null);
  assets = signal<Asset[]>([]);
  /**
   * Distinct tickers across all portfolios — populated alongside `portfolios` on init via the
   * dedicated backend aggregate endpoint. Drives the "Tickers détenus" sidebar shortcut.
   */
  ownedTickers = signal<OwnedTicker[]>([]);
  /** Tickers tracked outside the portfolio. Driven by `WatchlistRepository`. */
  watchlist = signal<WatchlistEntry[]>([]);
  /**
   * The watchlist autocomplete — the user types into this control, suggestions populate from the
   * configured market provider, the user picks one, and only then can they hit Add. Two-stage flow
   * (type → pick → add) gates the watchlist on validated symbols rather than letting the user store
   * any 10-char string. The `string | SymbolMatch | null` shape is what `mat-autocomplete` uses :
   * the field holds the raw text while the user types, then flips to the `SymbolMatch` object when
   * they pick a suggestion.
   */
  watchlistSearchControl = new FormControl<string | SymbolMatch | null>('');
  /** Suggestions currently displayed in the dropdown. Cleared after a successful add. */
  watchlistSuggestions = signal<SymbolMatch[]>([]);
  /**
   * Set when the user picks an option from the dropdown. The Add button stays disabled until this
   * is non-null — `null` is the signal that the user typed but didn't pick yet, so the symbol isn't
   * validated.
   */
  watchlistSelectedMatch = signal<SymbolMatch | null>(null);
  /** True while the search HTTP call is in flight ; drives the dropdown's loading hint. */
  watchlistSearching = signal(false);
  /** True while a POST is in flight ; disables the input + button to prevent double-submit. */
  watchlistAdding = signal(false);
  /** Surfaces add / remove errors next to the watchlist input. */
  watchlistError = signal<string | null>(null);

  /**
   * Lazy lookup map `symbol → instrumentType` for the watchlist chips. Populated by
   * [enrichWatchlistInstrumentTypes] on watchlist load + add ; never cleared on remove (stale
   * entries are harmless and a re-add hits the cache hot). The backend has a 15-min Caffeine
   * cache on `/api/market/ticker/{symbol}`, so the morning's first dashboard burns ~10-20 Twelve
   * Data credits and subsequent reloads hit zero. **Why not persist on the `watchlist` table** :
   * keeps the schema lean, no Flyway migration, no backfill of pre-existing entries — and the
   * cost is bounded (free tier 800 credits/day, watchlist refresh ≈ 2-3 % of that). If the call
   * fails (404 / 503), the entry is left absent from the map and the chip degrades closed
   * (mirror of the dossier header, the Sector toggle, and the Fondamentaux gating).
   *
   * Map shape : a key absent means "not yet looked up" ; a key with `null` means "looked up,
   * type was not detected" — both render no chip, but distinguishing them prevents re-fetching.
   */
  private watchlistInstrumentTypes = signal<
    Record<string, 'STOCK' | 'ETF' | 'INDEX' | 'OTHER' | null>
  >({});

  // ---- Sidebar accordion state ----
  // Three independent open/close toggles so the user can keep their preferred sections expanded
  // — the portfolio list grows long when many CSVs are imported, and folding it uncovers the
  // ownedTickers / watchlist shortcuts without scrolling. State is hydrated from localStorage at
  // construction time and persisted on every change via the effect registered in the constructor
  // (mirror of `ThemeService` and `LanguageService` patterns).
  portfoliosOpen = signal(readSidebarOpenState().portfolios);
  ownedTickersOpen = signal(readSidebarOpenState().ownedTickers);
  watchlistOpen = signal(readSidebarOpenState().watchlist);

  constructor() {
    effect(() => {
      const state: SidebarOpenState = {
        portfolios: this.portfoliosOpen(),
        ownedTickers: this.ownedTickersOpen(),
        watchlist: this.watchlistOpen(),
      };
      try {
        localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, JSON.stringify(state));
      } catch {
        // localStorage unavailable (private mode, quota exceeded) — silently ignore. The user's
        // session keeps the current state in memory ; only the cross-reload persistence is lost.
      }
    });
  }

  loading = signal(false);
  error = signal<string | null>(null);

  /** Total en CAD du portefeuille sélectionné (bookValueCad toujours en CAD). */
  totalPortfolioValueCad = computed(() =>
    this.assets().reduce((sum, a) => sum + a.bookValueCad, 0),
  );

  /** Grand total en CAD agrégé sur tous les portefeuilles — affiché dans la sidebar. */
  grandTotalCad = computed(() =>
    this.portfolios().reduce((sum, p) => sum + p.totalBookValueCad, 0),
  );

  ngOnInit() {
    this.loadPortfolios();
    this.loadOwnedTickers();
    this.loadWatchlist();
    this.wireWatchlistSearch();
  }

  /**
   * Subscribes the autocomplete `valueChanges` to the symbol search endpoint with a debounce so we
   * don't fire on every keystroke. The pipeline :
   * 1. `filter` keeps only string emissions — when the user picks an option, the control flips to
   *    a `SymbolMatch` object and we want that emission to stay out of the search/wipe path
   *    entirely (otherwise the previous typed string is still in the debounce buffer and would
   *    fire 300 ms later, wiping the freshly-set selection).
   * 2. Debounce 300 ms so a rapid typist doesn't pummel `/symbols/search`.
   * 3. `distinctUntilChanged` so backspace + retype same letters doesn't duplicate calls.
   * 4. `switchMap` — guard against the lingering-debounce race : if the user picked a suggestion
   *    while a typed string was in flight, the control's current value is now a `SymbolMatch` ;
   *    drop the stale string emission rather than wiping the user's selection. Otherwise wipe the
   *    previous selection and search via the market provider. `catchError` returns an empty list
   *    so a 503 collapses the dropdown to "no results" rather than blowing up the sidebar.
   * 5. `takeUntilDestroyed(destroyRef)` for automatic cleanup — Angular 21 idiomatic, no manual
   *    `Subscription` to track.
   */
  private wireWatchlistSearch() {
    this.watchlistSearchControl.valueChanges
      .pipe(
        filter((value): value is string => typeof value === 'string'),
        debounceTime(WATCHLIST_SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((typedValue) => {
          if (typeof this.watchlistSearchControl.value !== 'string') {
            // The user picked an option while this debounced typed value was in flight. The
            // control is now holding a `SymbolMatch`, the selection signal is set, the dropdown
            // can stay as-is — discard the stale emission rather than wiping the pick.
            return of(this.watchlistSuggestions());
          }
          this.watchlistSelectedMatch.set(null);
          const trimmed = typedValue.trim();
          if (trimmed.length === 0) {
            this.watchlistSuggestions.set([]);
            return of([]);
          }
          this.watchlistSearching.set(true);
          return this.marketRepository
            .searchSymbols(trimmed)
            .pipe(catchError(() => of<SymbolMatch[]>([])));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((suggestions) => {
        this.watchlistSuggestions.set(suggestions);
        this.watchlistSearching.set(false);
      });
  }

  /**
   * Called by `mat-autocomplete (optionSelected)` when the user picks a suggestion. Records the
   * pick so the Add button enables ; the control's value is now the `SymbolMatch` object itself.
   */
  onWatchlistSymbolSelected(event: MatAutocompleteSelectedEvent) {
    this.watchlistSelectedMatch.set(event.option.value as SymbolMatch);
  }

  /**
   * Display function for `mat-autocomplete` — controls what the input shows when the control's
   * value is a `SymbolMatch` object (after selection) vs a plain string (while typing). We show the
   * symbol only ; the dropdown options carry the full `SYMBOL — Name (EXCHANGE)` rendering.
   */
  displayWatchlistMatch(value: SymbolMatch | string | null): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    return value.symbol;
  }

  loadPortfolios() {
    this.loading.set(true);
    this.portfolioRepository.getAll().subscribe({
      next: (portfolios) => {
        const ordered = this.applyPersistedOrder(portfolios);
        this.portfolios.set(ordered);
        if (ordered.length > 0 && !this.selectedPortfolio()) {
          this.selectPortfolio(ordered[0]);
        }
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.translate.instant('dashboard.errors.loadPortfolios'));
        this.loading.set(false);
      },
    });
  }

  /**
   * Reorders portfolios coming from the API to match the user's saved drag-drop preference. IDs
   * still on disk are placed first in their saved order ; portfolios *not* in localStorage (newly
   * imported, freshly visible after a CSV reload) keep their server order and land at the end —
   * the user discovers them at the bottom rather than them silently displacing pinned ones.
   */
  private applyPersistedOrder(portfolios: Portfolio[]): Portfolio[] {
    const savedOrder = this.readPersistedOrder();
    if (savedOrder.length === 0) return portfolios;
    const byId = new Map(portfolios.map((p) => [p.id, p]));
    const ordered: Portfolio[] = [];
    for (const id of savedOrder) {
      const found = byId.get(id);
      if (found) {
        ordered.push(found);
        byId.delete(id);
      }
    }
    return [...ordered, ...byId.values()];
  }

  private readPersistedOrder(): string[] {
    try {
      const raw = localStorage.getItem(PORTFOLIO_ORDER_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string')
        : [];
    } catch {
      // Corrupt JSON shouldn't break the dashboard — drop the bad value and fall back to server
      // order. The next manual reorder will overwrite it cleanly.
      return [];
    }
  }

  private persistOrder(portfolios: Portfolio[]): void {
    const ids = portfolios.map((p) => p.id);
    localStorage.setItem(PORTFOLIO_ORDER_STORAGE_KEY, JSON.stringify(ids));
  }

  /**
   * Handler bound to `cdkDropListDropped` on the portfolio sidebar list. Mutates the local order
   * via [moveItemInArray] (CDK's in-place reorder helper) and persists the new ID sequence to
   * localStorage so a reload keeps the layout. Single-source-of-truth : the `portfolios` signal
   * itself.
   */
  onPortfolioDrop(event: CdkDragDrop<Portfolio[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const next = [...this.portfolios()];
    moveItemInArray(next, event.previousIndex, event.currentIndex);
    this.portfolios.set(next);
    this.persistOrder(next);
  }

  /**
   * Loaded once on init and not refreshed on portfolio change — the underlying data
   * (positions across portfolios) only changes on CSV import, which goes through `/import` and
   * eventually navigates away from the dashboard. A silent failure here doesn't surface an error
   * banner ; the sidebar shortcut just stays empty.
   */
  private loadOwnedTickers() {
    this.portfolioRepository.getOwnedTickers().subscribe({
      next: (tickers) => this.ownedTickers.set(tickers),
      error: () => this.ownedTickers.set([]),
    });
  }

  /**
   * Loaded once on init. Silent failure : the watchlist section just stays empty rather than
   * showing a scary error banner — same philosophy as `loadOwnedTickers`. Adds and removes have
   * their own narrow error surface (`watchlistError`).
   */
  private loadWatchlist() {
    this.watchlistRepository.list().subscribe({
      next: (entries) => {
        this.watchlist.set(entries);
        this.enrichWatchlistInstrumentTypes(entries.map((e) => e.symbol));
      },
      error: () => this.watchlist.set([]),
    });
  }

  /** Returns the chip's instrument type for a watchlist symbol, or undefined while the lookup is
   * in flight / the entry hasn't been queried. `null` means "looked up but not detected" — the
   * template treats both undefined and null as "no chip", but we keep the distinction in the map
   * to avoid refetching the same symbol on a re-add. */
  watchlistInstrumentTypeFor(
    symbol: string,
  ): 'STOCK' | 'ETF' | 'INDEX' | 'OTHER' | null | undefined {
    return this.watchlistInstrumentTypes()[symbol];
  }

  /**
   * Kicks off `getTicker` per symbol that we don't yet have a type for. Each lookup runs in
   * parallel ; results land in [watchlistInstrumentTypes] as they resolve, so chips appear
   * progressively rather than waiting on the slowest call. Errors are swallowed silently — the
   * chip just doesn't render for that symbol (degrade closed). The backend caches each
   * `getTicker` for 15 min, so subsequent dashboard loads in the same window pay zero.
   */
  private enrichWatchlistInstrumentTypes(symbols: string[]) {
    const known = this.watchlistInstrumentTypes();
    for (const symbol of symbols) {
      if (symbol in known) continue;
      this.marketRepository.getTicker(symbol).subscribe({
        next: (snap) =>
          this.watchlistInstrumentTypes.update((m) => ({
            ...m,
            [symbol]: snap.quote.instrumentType ?? null,
          })),
        error: () => {
          // Silent — degrade closed. Same posture as the Sector toggle / Fondamentaux gating
          // when the upstream call fails.
        },
      });
    }
  }

  /**
   * Adds the symbol the user picked in the autocomplete dropdown. Requires a non-null
   * `watchlistSelectedMatch` — the Add button is disabled until then, so this is mostly defensive.
   * The backend is idempotent (POSTing a duplicate returns the existing row) and now also validates
   * the symbol against the configured market provider (Phase 2 v2) — a 400 response surfaces as the
   * "invalid symbol" message in i18n.
   */
  addToWatchlist() {
    const selected = this.watchlistSelectedMatch();
    if (!selected || this.watchlistAdding()) return;
    this.watchlistAdding.set(true);
    this.watchlistError.set(null);
    this.watchlistRepository.add(selected.symbol).subscribe({
      next: (entry) => {
        // Replace any previous entry with the same symbol (the backend's idempotent add returns
        // the existing row when a duplicate is posted), then append. Sorted by addedAt ASC to
        // match the backend's `findAllByOrderByAddedAtAsc` ordering.
        const next = this.watchlist().filter((e) => e.symbol !== entry.symbol);
        next.push(entry);
        this.enrichWatchlistInstrumentTypes([entry.symbol]);
        this.watchlist.set(next);
        this.watchlistSearchControl.setValue('', { emitEvent: false });
        this.watchlistSelectedMatch.set(null);
        this.watchlistSuggestions.set([]);
        this.watchlistAdding.set(false);
      },
      error: (err: { status?: number }) => {
        const key =
          err.status === 400
            ? 'dashboard.watchlist.errors.invalid'
            : 'dashboard.watchlist.errors.add';
        this.watchlistError.set(this.translate.instant(key));
        this.watchlistAdding.set(false);
      },
    });
  }

  /**
   * Optimistic remove : the entry disappears from the list immediately, then we wait for the
   * server to confirm. On 404 (server out of sync) or any error we restore the entry and show
   * an error so the user knows their click didn't take.
   */
  removeFromWatchlist(symbol: string) {
    const before = this.watchlist();
    this.watchlist.set(before.filter((e) => e.symbol !== symbol));
    this.watchlistError.set(null);
    this.watchlistRepository.remove(symbol).subscribe({
      error: () => {
        this.watchlist.set(before);
        this.watchlistError.set(this.translate.instant('dashboard.watchlist.errors.remove'));
      },
    });
  }

  selectPortfolio(portfolio: Portfolio) {
    this.selectedPortfolio.set(portfolio);
    this.portfolioRepository.getAssets(portfolio.id).subscribe({
      next: (assets) => this.assets.set(assets),
      error: () => this.error.set(this.translate.instant('dashboard.errors.loadAssets')),
    });
  }

  clearError() {
    this.error.set(null);
  }
}
