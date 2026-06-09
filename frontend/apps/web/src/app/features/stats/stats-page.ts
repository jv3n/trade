import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';

import { PageEvent } from '@angular/material/paginator';
import { Sort } from '@angular/material/sort';
import { RouterLink } from '@angular/router';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  StbChipsModule,
  StbIconModule,
  StbPaginatorModule,
  StbProgressSpinnerModule,
  StbSortHeaderModule,
  StbTableModule,
  StbTooltipModule,
} from '@portfolioai/ui';

import { PageRequest, StatEntry } from '../../core/api/stats/stat-entry.model';
import { StatsRepository } from '../../core/api/stats/stats.repository';

/**
 * Sort state for the stats table — same controlled-component shape as the journal :
 *   - `columnName` empty → no user sort, backend falls back to its DEFAULT_SORT.
 *   - `columnName` set   → sort by this column ; `isAscending` picks the direction.
 *
 * Bound back into MatSort via `[matSortActive]` + `[matSortDirection]` so the arrow always tracks
 * the sort applied server-side.
 */
interface SortRequest {
  columnName: string;
  isAscending: boolean;
}

const DEFAULT_PAGE_SIZE = 25;

/**
 * Read-only stats table — the global `stat_entry` dataset (gap-up shorts setup context + the day's
 * price levels + the three derived percentages). No CRUD, no filters : the dataset is fed by the
 * ADMIN CSV import (`/settings/stats-import`) and this page just browses it page by page.
 *
 *   - **Server-side sort** : MatSort emits `(active, direction)` → forwarded as Spring's
 *     `?sort=field,direction`. Sorting always queries page 0 so we don't strand the user on a page
 *     index that doesn't exist for the new sort.
 *   - **Pagination** : `<mat-paginator>` below the table, default 25 rows per page.
 *
 * One effect watches (`sort`, `pageIndex`, `pageSize`) and refetches when any of them changes.
 * Charts / aggregates land in phase 2.
 */
@Component({
  selector: 'app-stats-page',
  imports: [
    DatePipe,
    DecimalPipe,
    StbChipsModule,
    StbIconModule,
    StbPaginatorModule,
    StbProgressSpinnerModule,
    StbSortHeaderModule,
    StbTableModule,
    StbTooltipModule,
    TranslatePipe,
    RouterLink,
  ],
  templateUrl: './stats-page.html',
  styleUrl: './stats-page.scss',
})
export class StatsPage {
  private readonly repo = inject(StatsRepository);
  private readonly translate = inject(TranslateService);

  // ---- Data state ----
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly entries = signal<StatEntry[]>([]);
  readonly totalElements = signal(0);

  // ---- Pagination ----
  readonly pageIndex = signal(0);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly pageSizeOptions = [10, 25, 50, 100];

  // ---- Sort (server-side, controlled-component pattern) ----
  readonly sort = signal<SortRequest>({ columnName: '', isAscending: true });

  readonly columns = [
    'tradeDate',
    'ticker',
    'gapUpPercent',
    'floatSharesMillions',
    'institutionsPercent',
    'instOver20',
    'under1Dollar',
    'ssr',
    'entryAfter11am',
    'openPrice',
    'highPrice',
    'lodPrice',
    'eodPrice',
    'pushPercent',
    'lodPercent',
    'eodPercent',
    'note',
  ] as const;

  constructor() {
    effect(() => {
      const sort = this.sort();
      const pageIndex = this.pageIndex();
      const pageSize = this.pageSize();
      this.fetch({
        pageIndex,
        pageSize,
        sortField: sort.columnName || undefined,
        sortDirection: sort.columnName ? (sort.isAscending ? 'asc' : 'desc') : undefined,
      });
    });
  }

  // ---- Sort handler ----
  // An empty direction (3rd click, cleared) maps to an empty columnName so the effect knows "no
  // user sort" and the backend falls back to its DEFAULT_SORT.
  onSortChange(s: Sort): void {
    this.sort.set({
      columnName: s.direction !== '' ? s.active : '',
      isAscending: s.direction === 'asc',
    });
    this.pageIndex.set(0);
  }

  // ---- Pagination handler ----
  onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  private fetch(page: PageRequest): void {
    this.loading.set(true);
    this.error.set(null);
    this.repo.findAll(page).subscribe({
      next: (result) => {
        this.entries.set(result.content);
        this.totalElements.set(result.totalElements);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.translate.instant('stats.errors.load'));
        this.loading.set(false);
      },
    });
  }
}
