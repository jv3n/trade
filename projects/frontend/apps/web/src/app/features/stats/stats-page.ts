import { DatePipe, DecimalPipe, formatDate } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, LOCALE_ID, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  PageEvent,
  Sort,
  StbButtonModule,
  StbButtonToggleModule,
  StbCheckboxModule,
  StbChipsModule,
  StbDatePickerModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
  StbPaginatorModule,
  StbProgressSpinnerModule,
  StbSelectModule,
  StbSortHeaderModule,
  StbTableModule,
  StbToast,
  StbTooltipModule,
} from '@portfolioai/ui';
import { isToday, isYesterday, startOfDay } from 'date-fns';
import {
  EMPTY,
  Observable,
  Subject,
  catchError,
  concatMap,
  debounceTime,
  distinctUntilChanged,
  filter,
  switchMap,
  tap,
} from 'rxjs';
import { DEFAULT_PATTERN, PATTERNS, Pattern } from '../../core/api/shared/pattern.model';
import {
  StatEntry,
  StatEntryFilter,
  StatEntryInput,
  StatStatus,
  StatSummary,
} from '../../core/api/stats/stat-entry.model';
import { StatsRepository } from '../../core/api/stats/stats.repository';
import { ConfirmService } from '../../core/app-state/confirm.service';
import { NumberMaskDirective } from '../../shared/number-mask/number-mask.directive';
import { PeriodFilter } from '../../shared/period-filter/period-filter';
import { PeriodSelection } from '../../shared/period-preset/period-preset';
import { PricePipe } from '../../shared/price/price.pipe';
import { gapPercent, percentVsOpen, pmPushPercent } from './stats.math';

/** Sort state — controlled-component shape (empty `columnName` = the backend's DEFAULT_SORT). */
interface SortRequest {
  columnName: string;
  isAscending: boolean;
}

/** The session block being typed in the session panel. Numbers are null until typed. */
interface SessionModel {
  openPrice: number | null;
  pushOpenPrice: number | null;
  hodPrice: number | null;
  lodPrice: number | null;
  eodPrice: number | null;
  ssr: boolean;
  under1Dollar: boolean;
  entryAfter11am: boolean;
  noPush: boolean;
  lowInstitutions: boolean;
}

/** The premarket block being typed in the premarket card — copied from the candidate, editable. */
interface PremarketModel {
  previousClose: number | null;
  pmOpen: number | null;
  pmHigh: number | null;
  floatMillions: number | null;
  volumeMillions: number | null;
  locatePerShare: number | null;
  note: string;
}

/** Who a new stat is : typed on top of the premarket card, only when creating one (#326). */
interface IdentityModel {
  tradeDate: Date | null;
  pattern: Pattern;
  ticker: string;
}

/** The two cards of the panel — each shows where its own last save stands. */
export type SheetCard = 'premarket' | 'session';

/**
 * Where a card's save stands, shown next to its title (no « Save » button, #326) : in flight, done
 * at a time, or refused with the reason (an i18n key).
 */
export interface SaveState {
  status: 'idle' | 'saving' | 'saved' | 'error';
  at: Date | null;
  reason: string | null;
}

type PremarketPrice =
  'previousClose' | 'pmOpen' | 'pmHigh' | 'floatMillions' | 'volumeMillions' | 'locatePerShare';

/** A listed stat with its derived percentages (never stored — recomputed from the prices). */
export interface StatRow extends StatEntry {
  gap: number | null;
  pmPush: number | null;
  pushOpenPercent: number | null;
  hodPercent: number | null;
  lodPercent: number | null;
  eodPercent: number | null;
  /** Label keys of the session prices still missing — the ✓ stays disabled until it's empty. */
  missing: string[];
  /** Why the day's range refuses this row (#305) — null when it holds. Blocks the ✓ too. */
  issue: string | null;
}

/**
 * Tabs of the mockup : all / to complete / completed, then the no-push days (#302) — a separate axis
 * of the filter, singled out to compare their premarket with the days that pushed.
 */
export type StatTab = StatStatus | 'NO_PUSH' | null;
const STATUS_TABS: readonly StatTab[] = [null, 'TO_COMPLETE', 'COMPLETED', 'NO_PUSH'];

const DEFAULT_PAGE_SIZE = 25;

/** Empty session block — what the panel shows before a stat is picked. */
const BLANK_SESSION: SessionModel = {
  openPrice: null,
  pushOpenPrice: null,
  hodPrice: null,
  lodPrice: null,
  eodPrice: null,
  ssr: false,
  under1Dollar: false,
  entryAfter11am: false,
  noPush: false,
  lowInstitutions: false,
};

const BLANK_PREMARKET: PremarketModel = {
  previousClose: null,
  pmOpen: null,
  pmHigh: null,
  floatMillions: null,
  volumeMillions: null,
  locatePerShare: null,
  note: '',
};

const IDLE: SaveState = { status: 'idle', at: null, reason: null };

/** Errors that say « the other card is holding this one » — the only ones a save settles (#348). */
const HELD_REASONS: readonly string[] = [
  'stats.save.waitingPremarket',
  'stats.save.waitingSession',
];

type SessionPrice = 'openPrice' | 'pushOpenPrice' | 'hodPrice' | 'lodPrice' | 'eodPrice';

/** The five session prices, in the sheet's order, with the label key naming them. */
const SESSION_PRICES: readonly { field: SessionPrice; label: string }[] = [
  { field: 'openPrice', label: 'stats.fields.openPriceShort' },
  { field: 'pushOpenPrice', label: 'stats.fields.pushOpen' },
  { field: 'hodPrice', label: 'stats.fields.hod' },
  { field: 'lodPrice', label: 'stats.fields.lod' },
  { field: 'eodPrice', label: 'stats.fields.eod' },
];

/** The session prices a stat needs — all five, or four on a no-push day. */
function expectedPrices(session: Pick<SessionModel, 'noPush'>) {
  return SESSION_PRICES.filter(({ field }) => !(session.noPush && field === 'pushOpenPrice'));
}

/** Label keys of the session prices still missing — what stands between a stat and its tick. */
export function missingPrices(session: Pick<SessionModel, SessionPrice | 'noPush'>): string[] {
  return expectedPrices(session)
    .filter(({ field }) => !isPositive(session[field]))
    .map((p) => p.label);
}

function premarketOf(entry: StatEntry): PremarketModel {
  return {
    previousClose: entry.previousClose,
    pmOpen: entry.pmOpen,
    pmHigh: entry.pmHigh,
    floatMillions: entry.floatMillions,
    volumeMillions: entry.volumeMillions,
    locatePerShare: entry.locatePerShare,
    note: entry.note ?? '',
  };
}

/** Why a premarket block can't be saved — an i18n key — or null when it can. */
export function premarketProblem(m: PremarketModel): string | null {
  if (![m.previousClose, m.pmOpen, m.pmHigh].every(isPositive)) {
    return 'stats.save.premarketRequired';
  }
  if ((m.pmHigh as number) < (m.pmOpen as number)) return 'stats.save.pmHighBelowPmOpen';
  return null;
}

/**
 * A day's range holds every price inside it (#305) : `LOD <= open, push, EOD <= HOD`. Returns the
 * i18n key of what is wrong and the fields that make it wrong — the HOD / LOD pair was the only
 * check before, so a stat could carry a HOD of 1 under a push of 10 and still be ticked. Prices at
 * zero are refused too, by [missingPrices] on the panel and by the backend on write.
 */
export function sessionProblem(
  session: SessionModel,
): { reason: string; fields: SessionPrice[] } | null {
  const { hodPrice: hod, lodPrice: lod } = session;
  if (hod !== null && lod !== null && hod < lod) {
    return { reason: 'stats.save.hodBelowLod', fields: ['hodPrice', 'lodPrice'] };
  }
  const inside: SessionPrice[] = ['openPrice', 'pushOpenPrice', 'eodPrice'];
  const above = inside.filter((f) => hod !== null && session[f] !== null && session[f]! > hod);
  if (above.length > 0) return { reason: 'stats.save.aboveHod', fields: [...above, 'hodPrice'] };
  const below = inside.filter((f) => lod !== null && session[f] !== null && session[f]! < lod);
  if (below.length > 0) return { reason: 'stats.save.belowLod', fields: [...below, 'lodPrice'] };
  return null;
}

function sessionOf(entry: StatEntry): SessionModel {
  return {
    openPrice: entry.openPrice,
    pushOpenPrice: entry.pushOpenPrice,
    hodPrice: entry.hodPrice,
    lodPrice: entry.lodPrice,
    eodPrice: entry.eodPrice,
    ssr: entry.ssr,
    under1Dollar: entry.under1Dollar,
    entryAfter11am: entry.entryAfter11am,
    noPush: entry.noPush,
    lowInstitutions: entry.lowInstitutions,
  };
}

/**
 * Stats page — the sheet filled as the day goes and ticked once complete (cf. `mockup/stats.html`
 * and `mockup/PARCOURS.md`, step 5) :
 *
 * - **KPIs** over the filtered set (not the current page) : stats completed / to complete, average
 *   push at open, average LOD, fade at the close. They come from `GET /api/stats/summary`.
 * - **Session panel** : the premarket recap on top, then the session prices with their live % vs
 *   the open and the three flags — each saved on its own, when the field is left (an edit : no
 *   modal) — the « n / 5 » progress (4 on a no-push day), Close, and the ✓ that ticks the stat once its prices are
 *   in. It opens on the first stat to complete of the page and on any row's « Session » button.
 * - **The ✓ column** ticks / unticks a stat from the table (#263). A ticked stat can't lose a price :
 *   clearing one is refused with a toast — untick it first.
 * - **Table** in two column groups — Premarket (copied from the candidate) and Session (price + %
 *   vs the open) — then the flags. Every column is kept ; horizontal scrolling is fine.
 * - **Filters** : search, period (preset or custom range, shared [PeriodFilter]), pattern, status ;
 *   server-side sort + pagination.
 *
 * Stats are created by promoting a candidate (#189) — this page never creates one. The « → Trade »
 * column (#193) is the **only** way a trade comes into existence : one per stat, confirmed, and the
 * row shows a link to that trade from then on.
 */
@Component({
  selector: 'app-stats-page',
  imports: [
    DatePipe,
    DecimalPipe,
    PricePipe,
    NumberMaskDirective,
    PeriodFilter,
    RouterLink,
    StbButtonModule,
    StbButtonToggleModule,
    StbCheckboxModule,
    StbChipsModule,
    StbDatePickerModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    StbPaginatorModule,
    StbProgressSpinnerModule,
    StbSelectModule,
    StbSortHeaderModule,
    StbTableModule,
    StbTooltipModule,
    TranslatePipe,
  ],
  templateUrl: './stats-page.html',
  styleUrl: './stats-page.scss',
})
export class StatsPage {
  private readonly repo = inject(StatsRepository);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(StbToast);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly locale = inject(LOCALE_ID);

  // ---- Data state ----
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly entries = signal<StatEntry[]>([]);
  readonly totalElements = signal(0);
  readonly summary = signal<StatSummary | null>(null);

  // ---- Pagination ----
  readonly pageIndex = signal(0);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly pageSizeOptions = [10, 25, 50, 100];

  // ---- Refetch nudge (a save / delete bumps it to re-fire the fetch effect) ----
  private readonly refetchTrigger = signal(0);

  // ---- Search (debounced 250 ms) ----
  private readonly searchInput$ = new Subject<string>();
  readonly searchTerm = toSignal(
    this.searchInput$.pipe(debounceTime(250), distinctUntilChanged()),
    {
      initialValue: '',
    },
  );
  readonly searchValue = signal('');

  // ---- Filters ----
  readonly period = signal<PeriodSelection>({ period: 'all', dateFrom: null, dateTo: null });
  readonly patterns = PATTERNS;
  readonly pattern = signal<Pattern | null>(null);
  readonly statusTabs = STATUS_TABS;
  readonly status = signal<StatTab>(null);

  // ---- Sort ----
  readonly sort = signal<SortRequest>({ columnName: '', isAscending: true });

  readonly columns = [
    'tradeDate',
    'ticker',
    'pattern',
    'gap',
    'pmPush',
    'float',
    'volume',
    'locate',
    'openPrice',
    'pushOpen',
    'hod',
    'lod',
    'eod',
    'flags',
    'completed',
    'trade',
    'actions',
  ] as const;

  /** The day's rows with their derived percentages. */
  readonly rows = computed<StatRow[]>(() =>
    this.entries().map((e) => ({
      ...e,
      gap: gapPercent(e.previousClose, e.pmOpen),
      pmPush: pmPushPercent(e.pmOpen, e.pmHigh),
      pushOpenPercent: percentVsOpen(e.openPrice, e.pushOpenPrice),
      hodPercent: percentVsOpen(e.openPrice, e.hodPrice),
      lodPercent: percentVsOpen(e.openPrice, e.lodPrice),
      eodPercent: percentVsOpen(e.openPrice, e.eodPrice),
      missing: missingPrices(e),
      // A row written before the range rule existed can still hold an impossible set : the ✓ of
      // the table answers for it like the panel's does, and the backend replays it on the tick.
      issue: sessionProblem(sessionOf(e))?.reason ?? null,
    })),
  );

  // ---- Session panel ----
  /** The stat open in the panel — null = the panel is closed. */
  readonly completing = signal<StatEntry | null>(null);
  readonly premarket = signal<PremarketModel>(BLANK_PREMARKET);
  readonly session = signal<SessionModel>(BLANK_SESSION);
  readonly saveStates = signal<Record<SheetCard, SaveState>>({ premarket: IDLE, session: IDLE });

  // ---- New stat (#326) : the same two cards, empty, with the identity on top ----
  readonly creating = signal(false);
  readonly identity = signal<IdentityModel>({
    tradeDate: null,
    pattern: DEFAULT_PATTERN,
    ticker: '',
  });
  /** A stat is dated up to today — the picker stops there, the backend refuses a future day. */
  readonly maxDate = startOfDay(new Date());
  /** Rows the user closed — they stop auto-opening the panel for this visit. */
  private readonly dismissed = signal<ReadonlySet<string>>(new Set());
  /**
   * Every write goes through this queue, one at a time : a field left right before a click on ✓
   * must reach the server first, or the tick would be judged on the row without that price.
   */
  private readonly writes = new Subject<Observable<unknown>>();

  /** Live gap and premarket push under their fields, as the user types. */
  readonly premarketPercents = computed(() => {
    const m = this.premarket();
    return {
      gap: gapPercent(m.previousClose, m.pmOpen),
      pmPush: pmPushPercent(m.pmOpen, m.pmHigh),
    };
  });

  /** PM high under the PM open — shown under the field, and nothing is sent. */
  readonly pmHighBelowPmOpen = computed(() => {
    const { pmOpen, pmHigh } = this.premarket();
    return pmOpen !== null && pmHigh !== null && pmHigh < pmOpen;
  });

  /** What « Create the stat » still needs — i18n keys, empty once it can go. */
  readonly createMissing = computed(() => {
    const id = this.identity();
    const missing: string[] = [];
    if (!id.tradeDate) missing.push('stats.fields.tradeDate');
    if (!id.ticker.trim()) missing.push('stats.fields.ticker');
    if (premarketProblem(this.premarket())) missing.push('stats.create.premarketPrices');
    return missing;
  });

  /** Live % vs the open for each session input, as the user types. */
  readonly sessionPercents = computed(() => {
    const m = this.session();
    return {
      pushOpen: percentVsOpen(m.openPrice, m.pushOpenPrice),
      hod: percentVsOpen(m.openPrice, m.hodPrice),
      lod: percentVsOpen(m.openPrice, m.lodPrice),
      eod: percentVsOpen(m.openPrice, m.eodPrice),
    };
  });

  /** The required premarket prices left empty on an existing stat — each one says so under its field. */
  readonly premarketRequired = computed(() => {
    const m = this.premarket();
    const edit = this.completing() !== null;
    return {
      previousClose: edit && !isPositive(m.previousClose),
      pmOpen: edit && !isPositive(m.pmOpen),
      pmHigh: edit && !isPositive(m.pmHigh),
    };
  });

  /**
   * The panel shows values the stat doesn't hold — a save held back by a validation, whichever. A
   * sent save patches the row at once, so only edits that never left count ; leaving drops them.
   */
  readonly hasPendingEdits = computed(() => {
    const entry = this.completing();
    return (
      entry !== null &&
      !(
        // The note goes out trimmed : a trailing space is not an edit left behind.
        samePremarket(
          { ...this.premarket(), note: this.premarket().note.trim() },
          premarketOf(entry),
        ) && sameSession(this.session(), sessionOf(entry))
      )
    );
  });

  /** What makes the session block impossible, and which fields say so — null when it holds. */
  readonly sessionIssue = computed(() => sessionProblem(this.session()));

  /** True when [field] takes part in the current incoherence — its own hint then says which. */
  atFault(field: SessionPrice): boolean {
    return this.sessionIssue()?.fields.includes(field) ?? false;
  }

  /** Label keys of the prices the panel still misses. */
  readonly sessionMissing = computed(() => missingPrices(this.session()));
  readonly sessionPriceCount = computed(() => expectedPrices(this.session()).length);
  readonly sessionFilled = computed(() => this.sessionPriceCount() - this.sessionMissing().length);
  /** The push typed before « no push » was ticked — given back if it is unticked. */
  private typedPush: number | null = null;

  constructor() {
    this.writes.pipe(concatMap((write) => write)).subscribe();

    effect(() => {
      const filterValue = this.currentFilter();
      const sort = this.sort();
      const pageIndex = this.pageIndex();
      const pageSize = this.pageSize();
      this.refetchTrigger();
      this.fetch(filterValue, {
        pageIndex,
        pageSize,
        sortField: sort.columnName || undefined,
        sortDirection: sort.columnName ? (sort.isAscending ? 'asc' : 'desc') : undefined,
      });
    });
  }

  // ---- Filter handlers ----

  onSearchInput(value: string): void {
    this.searchValue.set(value);
    this.searchInput$.next(value);
    this.pageIndex.set(0);
  }

  clearSearch(): void {
    this.searchValue.set('');
    this.searchInput$.next('');
    this.pageIndex.set(0);
  }

  setPeriod(selection: PeriodSelection): void {
    this.period.set(selection);
    this.pageIndex.set(0);
  }

  setPattern(pattern: Pattern | null): void {
    this.pattern.set(pattern);
    this.pageIndex.set(0);
  }

  setStatus(status: StatTab): void {
    this.status.set(status);
    this.pageIndex.set(0);
  }

  onSortChange(sort: Sort): void {
    this.sort.set({
      columnName: sort.direction ? sort.active : '',
      isAscending: sort.direction === 'asc',
    });
    this.pageIndex.set(0);
  }

  onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  // ---- Session panel ----

  open(entry: StatEntry): void {
    this.leavePanel(() => this.show(entry));
  }

  private show(entry: StatEntry): void {
    this.creating.set(false);
    this.completing.set(entry);
    this.premarket.set(premarketOf(entry));
    this.session.set(sessionOf(entry));
    this.typedPush = null;
    // Both cards open on what is already in : saved at the stat's last update.
    const saved: SaveState = { status: 'saved', at: entry.updatedAt, reason: null };
    this.saveStates.set({ premarket: saved, session: saved });
  }

  setPremarketPrice(field: PremarketPrice, value: number | null): void {
    this.premarket.update((m) => ({ ...m, [field]: value }));
  }

  setPremarketNote(note: string): void {
    this.premarket.update((m) => ({ ...m, note }));
  }

  setSessionPrice(field: SessionPrice, value: number | null): void {
    this.session.update((m) => ({ ...m, [field]: value }));
  }

  toggleFlag(
    field: 'ssr' | 'under1Dollar' | 'entryAfter11am' | 'lowInstitutions',
    value: boolean,
  ): void {
    this.session.update((m) => ({ ...m, [field]: value }));
    this.saveSession('session');
  }

  /** « No push » greys the push field out and empties it ; unticking gives the typed value back. */
  toggleNoPush(noPush: boolean): void {
    const current = this.session();
    if (noPush) this.typedPush = current.pushOpenPrice;
    this.session.set({ ...current, noPush, pushOpenPrice: noPush ? null : this.typedPush });
    this.saveSession('session');
  }

  /**
   * Saves the stat when a field of [card] is left — the whole row goes back, as the backend expects,
   * and [card] shows where the save stands. Nothing is sent while a new stat isn't created yet, when
   * nothing changed, or when the card holds a problem the server would refuse (the card says it). A
   * ticked stat losing a price is refused here, before the backend's 400.
   */
  saveSession(card: SheetCard = 'session'): void {
    const entry = this.completing();
    if (!entry || this.creating()) return;
    const premarket = this.premarket();
    const session = this.session();
    // Every save sends the whole row : a card the server would refuse holds the other one too.
    const premarketIssue = premarketProblem(premarket);
    const sessionIssue = this.sessionIssue()?.reason ?? null;
    const problem =
      card === 'premarket'
        ? (premarketIssue ?? (sessionIssue && 'stats.save.waitingSession'))
        : premarketIssue
          ? 'stats.save.waitingPremarket'
          : sessionIssue;
    if (problem) {
      this.setSaveState(card, { status: 'error', at: null, reason: problem });
      return;
    }
    if (sameSession(session, sessionOf(entry)) && samePremarket(premarket, premarketOf(entry))) {
      return;
    }
    if (entry.completed && missingPrices(session).length > 0) {
      this.toasts.error(
        this.translate.instant('stats.snackbar.untickFirst', { ticker: entry.ticker }),
      );
      this.session.set(sessionOf(entry));
      return;
    }
    // Patched right away : the next field left starts from this one, not from the server's reply.
    const input = this.toInput(entry, premarket, session);
    this.patchRow({ ...entry, ...input });
    this.setSaveState(card, { status: 'saving', at: null, reason: null });
    this.enqueue(
      this.repo.update(entry.id, input).pipe(
        tap((saved) => {
          this.patchRow(saved);
          const at = new Date();
          this.setSaveState(card, { status: 'saved', at, reason: null });
          // The request carried the **whole row**, so whatever the other card was holding back for
          // this one has just gone out with it (#348). Its own problems, if any, are left alone.
          this.releaseHeldCard(card === 'premarket' ? 'session' : 'premarket', at);
          // The KPIs only count ticked stats : editing one of them moves them.
          if (saved.completed) this.refreshSummary();
        }),
        catchError(() => {
          this.patchRow(entry);
          if (this.completing()?.id === entry.id) {
            this.premarket.set(premarketOf(entry));
            this.session.set(sessionOf(entry));
          }
          this.setSaveState(card, {
            status: 'error',
            at: null,
            reason: 'stats.save.serverRefused',
          });
          this.toasts.error(
            this.translate.instant('stats.snackbar.sessionSaveError', { ticker: entry.ticker }),
          );
          return EMPTY;
        }),
      ),
    );
  }

  /** « saving… », « ✓ saved at 09:42 », « not saved — … » — the label next to a card's title. */
  saveLabel(state: SaveState): string {
    switch (state.status) {
      case 'saving':
        return this.translate.instant('stats.save.saving');
      case 'saved': {
        if (!state.at) return '';
        const time = formatDate(state.at, 'HH:mm', this.locale);
        // Opening a stat shows its last update, often from a previous day (#342).
        if (isToday(state.at)) return this.translate.instant('stats.save.savedAt', { time });
        if (isYesterday(state.at)) {
          return this.translate.instant('stats.save.savedYesterdayAt', { time });
        }
        const date = formatDate(state.at, 'shortDate', this.locale);
        return this.translate.instant('stats.save.savedOnAt', { date, time });
      }
      case 'error':
        return this.translate.instant('stats.save.notSaved', {
          reason: this.translate.instant(state.reason ?? 'stats.save.serverRefused'),
        });
      default:
        return '';
    }
  }

  // ---- New stat (#326) ----

  /** « New stat » — the two cards empty, today's date and the default pattern pre-filled. */
  startNew(): void {
    this.leavePanel(() => this.showNew());
  }

  private showNew(): void {
    this.completing.set(null);
    this.creating.set(true);
    this.identity.set({ tradeDate: this.maxDate, pattern: DEFAULT_PATTERN, ticker: '' });
    this.premarket.set(BLANK_PREMARKET);
    this.session.set(BLANK_SESSION);
    this.typedPush = null;
    this.saveStates.set({ premarket: IDLE, session: IDLE });
  }

  cancelNew(): void {
    this.creating.set(false);
  }

  setIdentity(patch: Partial<IdentityModel>): void {
    this.identity.update((id) => ({ ...id, ...patch }));
  }

  /**
   * « Create the stat » — confirmed (it creates something), then the stat joins the table and its
   * cards go on saving field by field, like any stat's.
   */
  createStat(): void {
    if (!this.creating() || this.createMissing().length > 0) return;
    const id = this.identity();
    const ticker = id.ticker.trim().toUpperCase();
    const input: StatEntryInput = {
      tradeDate: id.tradeDate as Date,
      pattern: id.pattern,
      ticker,
      ...this.premarketInput(this.premarket()),
      ...this.session(),
    };
    this.confirm
      .ask('stats.confirmCreate', { params: { ticker } })
      .pipe(
        filter(Boolean),
        switchMap(() => this.repo.create(input)),
        tap((saved) => {
          this.toasts.success(this.translate.instant('stats.snackbar.createSuccess', { ticker }));
          this.open(saved);
          this.refetch();
        }),
        catchError((err: unknown) => {
          const key =
            err instanceof HttpErrorResponse && err.status === 409
              ? 'stats.snackbar.createConflict'
              : 'stats.snackbar.createError';
          this.toasts.error(this.translate.instant(key, { ticker }));
          return EMPTY;
        }),
      )
      .subscribe();
  }

  /** « Missing : date, ticker » — next to « Create the stat » while it can't go. */
  createMissingLabel(): string {
    const fields = this.createMissing().map((key) => this.translate.instant(key));
    return this.translate.instant('stats.completion.missing', { fields: fields.join(', ') });
  }

  /** « Close » — the field being typed is saved on the way out, then the panel stops re-opening. */
  close(): void {
    const current = this.completing();
    if (!current) return;
    const premarketEdited = !samePremarket(this.premarket(), premarketOf(current));
    this.saveSession(premarketEdited ? 'premarket' : 'session');
    this.leavePanel(() => {
      this.dismissed.update((set) => new Set(set).add(current.id));
      this.completing.set(null);
    });
  }

  /**
   * Runs [leave] — straight away, or after « Leave without saving? » when the panel holds edits a
   * validation kept from saving. Leaving drops them : the row still holds the last saved values.
   */
  private leavePanel(leave: () => void): void {
    if (!this.hasPendingEdits()) {
      leave();
      return;
    }
    this.confirm
      .ask('stats.confirmLeave', { variant: 'danger' })
      .pipe(filter(Boolean))
      .subscribe(() => leave());
  }

  /**
   * The ✓ — ticks the stat as completed, or unticks it back to "to complete". Ticking needs the five
   * prices (four on a no-push day) : the button is disabled without them, and the backend refuses
   * it too. The list reloads,
   * since the status filter and the KPIs both depend on it.
   */
  toggleCompleted(entry: StatEntry): void {
    const completed = !entry.completed;
    if (completed && missingPrices(entry).length > 0) return;
    this.enqueue(
      this.repo.setCompleted(entry.id, completed).pipe(
        tap((saved) => {
          this.patchRow(saved);
          this.refetch();
        }),
        catchError(() => {
          this.toasts.error(
            this.translate.instant('stats.snackbar.completionError', { ticker: entry.ticker }),
          );
          return EMPTY;
        }),
      ),
    );
  }

  /**
   * Why the ✓ can't tick the open stat — a missing price, or a set the day's range refuses (#305).
   * Empty when nothing stands in the way, which is also what disables the button.
   */
  tickBlockedReason(): string {
    if (this.sessionMissing().length > 0) return this.missingLabel(this.session());
    const issue = this.sessionIssue();
    return issue ? this.translate.instant(issue.reason) : '';
  }

  /** The same answer for a row of the table, which has no panel model to read. */
  rowBlockedReason(row: StatRow): string {
    if (row.missing.length > 0) return this.missingLabel(row);
    return row.issue ? this.translate.instant(row.issue) : '';
  }

  /** « Il manque HOD, EOD » — the ✓'s tooltip while it can't tick. */
  missingLabel(entry: Pick<SessionModel, SessionPrice | 'noPush'>): string {
    const fields = missingPrices(entry).map((key) => this.translate.instant(key));
    return this.translate.instant('stats.completion.missing', { fields: fields.join(', ') });
  }

  // ---- Row actions ----

  /**
   * « → Trade » (#193) — confirmed, then the backend creates the trade and we land straight on its
   * page : the point of the action is to go and type the executions. One trade per stat, so the
   * button is gone from that row on the way back.
   */
  promoteToTrade(entry: StatEntry): void {
    this.confirm
      .ask('stats.confirmPromoteTrade', { params: { ticker: entry.ticker } })
      .pipe(
        filter(Boolean),
        switchMap(() => this.repo.promoteToTrade(entry.id)),
        tap((trade) => {
          this.toasts.success(
            this.translate.instant('stats.snackbar.promoteTradeSuccess', { ticker: entry.ticker }),
          );
          void this.router.navigate(['/journal', trade.id]);
        }),
        catchError(() => {
          this.toasts.error(this.translate.instant('stats.snackbar.promoteTradeError'));
          return EMPTY;
        }),
      )
      .subscribe();
  }

  delete(entry: StatEntry): void {
    this.confirm
      .ask('stats.confirmDelete', { params: { ticker: entry.ticker }, variant: 'danger' })
      .pipe(
        filter(Boolean),
        switchMap(() => this.repo.delete(entry.id)),
        tap(() => {
          this.toasts.success(
            this.translate.instant('stats.snackbar.deleteSuccess', { ticker: entry.ticker }),
          );
          if (this.completing()?.id === entry.id) this.completing.set(null);
          // Deleting the last row of a non-zero page would strand the user on an empty page.
          if (this.entries().length === 1 && this.pageIndex() > 0) {
            this.pageIndex.update((n) => n - 1);
          } else {
            this.refetch();
          }
        }),
        catchError(() => {
          this.toasts.error(this.translate.instant('stats.snackbar.deleteError'));
          return EMPTY;
        }),
      )
      .subscribe();
  }

  // ---- Internals ----

  private currentFilter(): StatEntryFilter {
    const range = this.period();
    const tab = this.status();
    return {
      query: this.searchTerm() || null,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      pattern: this.pattern(),
      status: tab === 'NO_PUSH' ? null : tab,
      noPush: tab === 'NO_PUSH' || null,
    };
  }

  private fetch(
    filterValue: StatEntryFilter,
    page: {
      pageIndex: number;
      pageSize: number;
      sortField?: string;
      sortDirection?: 'asc' | 'desc';
    },
  ): void {
    this.loading.set(true);
    this.error.set(null);
    this.repo.findAll(filterValue, page).subscribe({
      next: (result) => {
        this.entries.set(result.content);
        this.totalElements.set(result.totalElements);
        this.loading.set(false);
        this.autoOpenPending(result.content);
      },
      error: () => {
        this.entries.set([]);
        this.error.set(this.translate.instant('stats.errors.load'));
        this.loading.set(false);
      },
    });
    this.repo.summary(filterValue).subscribe({
      next: (summary) => this.summary.set(summary),
      error: () => this.summary.set(null),
    });
  }

  /**
   * Opens the session panel on the first stat of the page still to complete. Stats closed during
   * this visit are skipped, and an open panel is never replaced.
   */
  private autoOpenPending(rows: StatEntry[]): void {
    if (this.completing() || this.creating()) return;
    const pending = rows.find((s) => !s.completed && !this.dismissed().has(s.id));
    if (pending) this.open(pending);
  }

  private enqueue(write: Observable<unknown>): void {
    this.writes.next(write);
  }

  /** Replaces a row of the page — and the panel's stat when it is that one — with [entry]. */
  private patchRow(entry: StatEntry): void {
    this.entries.update((list) => list.map((s) => (s.id === entry.id ? entry : s)));
    if (this.completing()?.id === entry.id) this.completing.set(entry);
  }

  private refreshSummary(): void {
    this.repo.summary(this.currentFilter()).subscribe({
      next: (summary) => this.summary.set(summary),
      error: () => this.summary.set(null),
    });
  }

  private refetch(): void {
    this.refetchTrigger.update((n) => n + 1);
  }

  /**
   * Clears a card left waiting on the one that just saved — and only that : a card blocked on a
   * problem of its own (a HOD under the LOD) keeps its error, since nothing solved it.
   */
  private releaseHeldCard(card: SheetCard, at: Date): void {
    const state = this.saveStates()[card];
    const held = state.status === 'error' && HELD_REASONS.includes(state.reason ?? '');
    if (held) this.setSaveState(card, { status: 'saved', at, reason: null });
  }

  private setSaveState(card: SheetCard, state: SaveState): void {
    this.saveStates.update((states) => ({ ...states, [card]: state }));
  }

  /** The panel sends the whole row back — identity untouched, premarket, session and flags typed. */
  private toInput(
    entry: StatEntry,
    premarket: PremarketModel,
    session: SessionModel,
  ): StatEntryInput {
    return {
      tradeDate: entry.tradeDate,
      pattern: entry.pattern,
      ticker: entry.ticker,
      ...this.premarketInput(premarket),
      ...session,
    };
  }

  /** The premarket card as the API takes it — its three prices are checked before this is called. */
  private premarketInput(m: PremarketModel) {
    return {
      previousClose: m.previousClose as number,
      pmOpen: m.pmOpen as number,
      pmHigh: m.pmHigh as number,
      floatMillions: m.floatMillions,
      volumeMillions: m.volumeMillions,
      locatePerShare: m.locatePerShare,
      note: m.note.trim() || null,
    };
  }
}

function isPositive(n: number | null): boolean {
  return n !== null && n > 0;
}

function samePremarket(a: PremarketModel, b: PremarketModel): boolean {
  return (Object.keys(a) as (keyof PremarketModel)[]).every((key) => a[key] === b[key]);
}

function sameSession(a: SessionModel, b: SessionModel): boolean {
  return (Object.keys(a) as (keyof SessionModel)[]).every((key) => a[key] === b[key]);
}
