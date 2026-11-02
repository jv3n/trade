import { Signal, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable, Subject, concatMap, filter, tap } from 'rxjs';
import { PageRequest, StatEntry, StatEntryFilter } from '../../core/api/stats/stat-entry.model';
import { StatsRepository } from '../../core/api/stats/stats.repository';
import { ConfirmService } from '../../core/app-state/confirm.service';
import { keptValue } from '../../shared/kept-value/kept-value';

/** What the page hands the store : the query it builds, and what to do with each page. */
export interface StatSheetSource {
  filter: Signal<StatEntryFilter>;
  page: Signal<PageRequest>;
  /** [keepPanel] : this load was asked by a write, the panel stays wherever its stat went. */
  listed(rows: StatEntry[], keepPanel: boolean): void;
}

/**
 * The stats listing and the writes on it. Not a provider : the page builds it in a field, handing
 * it the query its own filters make, and it lasts one visit like them.
 */
export class StatSheetStore {
  private readonly repo = inject(StatsRepository);
  private readonly confirm = inject(ConfirmService);

  /**
   * Bumped by a write, and part of the resources' params : a new key supersedes a load in flight,
   * where `reload()` is a no-op while one runs — its pre-write answer would win. A field saved on a
   * ticked stat only moves the KPIs, hence their own counter.
   */
  private readonly listingWrites = signal(0);
  private readonly kpiWriteCount = signal(0);
  readonly kpiWrites = this.kpiWriteCount.asReadonly();

  /**
   * Every write goes through this queue, one at a time : a field left right before a click on ✓
   * must reach the server first, or the tick would be judged on the row without that price.
   */
  private readonly writes = new Subject<Observable<unknown>>();

  /**
   * Whether the next listing keeps the panel wherever its stat went : a reload a write asked for
   * (tick, create, delete), and the first one, which a `?stat=` link may have opened off the page.
   */
  private keepPanel = true;

  /** What the server answered : a save captures its row before the write ahead of it comes back. */
  private readonly answeredVersions = new Map<string, number>();

  private readonly listing = rxResource({
    params: () => ({
      filter: this.source.filter(),
      page: this.source.page(),
      writes: this.listingWrites(),
    }),
    stream: ({ params }) =>
      this.repo.findAll(params.filter, params.page).pipe(
        tap(({ content }) => {
          const keepPanel = this.keepPanel;
          this.keepPanel = false;
          this.source.listed(content, keepPanel);
        }),
      ),
  });
  private readonly page = keptValue(this.listing);
  readonly loading = this.listing.isLoading;
  readonly error = computed(() => this.listing.status() === 'error');
  readonly entries = computed<StatEntry[]>(() => this.page()?.content ?? []);
  readonly totalElements = computed(() => this.page()?.totalElements ?? 0);

  constructor(private readonly source: StatSheetSource) {
    this.writes.pipe(concatMap((write) => write)).subscribe();
  }

  enqueue(write: Observable<unknown>): void {
    this.writes.next(write);
  }

  latestVersion(entry: StatEntry): number {
    return Math.max(entry.version, this.answeredVersions.get(entry.id) ?? 0);
  }

  keepPanelOnNextLoad(): void {
    this.keepPanel = true;
  }

  /**
   * Replaces a row of the page with [entry]. While a page loads, writing the resource would cancel
   * that load, and its GET may predate the save : the page is asked again instead — once the server
   * has [answered] only. Before the save goes out, or put back after it failed, a reload would read
   * nothing newer than the load already running.
   */
  patchRow(entry: StatEntry, answered: boolean): void {
    if (answered) this.answeredVersions.set(entry.id, entry.version);
    if (this.listing.isLoading()) {
      if (answered) {
        this.keepPanel = true;
        this.listingWrites.update((n) => n + 1);
      }
      return;
    }
    this.listing.value.update(
      (page) =>
        page && {
          ...page,
          content: page.content.map((s) => (s.id === entry.id ? entry : s)),
        },
    );
  }

  refreshSummary(): void {
    this.kpiWriteCount.update((n) => n + 1);
  }

  refetch(): void {
    this.keepPanel = true;
    this.listingWrites.update((n) => n + 1);
    this.refreshSummary();
  }

  /**
   * Runs [leave] — straight away, or after « Leave without saving? » when the panel [holdsEdits] a
   * validation kept from saving. Leaving drops them : the row still holds the last saved values.
   */
  leavePanel(holdsEdits: boolean, leave: () => void): void {
    if (!holdsEdits) {
      leave();
      return;
    }
    this.confirm
      .ask('stats.confirmLeave', { variant: 'danger' })
      .pipe(filter(Boolean))
      .subscribe(() => leave());
  }
}
