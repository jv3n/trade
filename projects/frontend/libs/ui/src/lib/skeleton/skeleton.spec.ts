import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  StbSkeletonCard,
  StbSkeletonKpiRow,
  StbSkeletonTable,
  type StbSkeletonColumn,
} from './skeleton-patterns';
import { StbSkeleton } from './skeleton.component';

/**
 * The placeholders a page shows on its first load (#539). What is pinned :
 *
 *  - **A block is shaped, never spoken** — variant and size reach the block, and it is hidden from
 *    assistive tech ; the region that loads says « loading » once, through its label.
 *  - **The table skeleton is the real table's frame** — the real headers, the `stbCol` alignment on
 *    the ghost cells, chip-shaped tickers and empty action cells, so nothing moves when rows land.
 *  - **The KPI row and the card take their count** — tiles, lines, and a bare card for a card that
 *    is already on screen.
 */
type Shown = 'block' | 'table' | 'kpi' | 'card' | 'bare' | 'decor';

@Component({
  imports: [StbSkeleton, StbSkeletonTable, StbSkeletonKpiRow, StbSkeletonCard],
  template: `
    @switch (shown()) {
      @case ('block') {
        <ui-skeleton variant="chip" [width]="80" height="2rem" [count]="3" />
      }
      @case ('table') {
        <ui-skeleton-table [columns]="columns" label="Loading the journal" [rows]="4" />
      }
      @case ('kpi') {
        <ui-skeleton-kpi-row label="Loading" [count]="5" />
      }
      @case ('card') {
        <ui-skeleton-card label="Loading" [lines]="2" />
      }
      @case ('bare') {
        <ui-skeleton-card label="Loading" bare />
      }
      @case ('decor') {
        <ui-skeleton-card [lines]="2" />
      }
    }
  `,
})
class Host {
  readonly shown = signal<Shown>('block');
  readonly columns: StbSkeletonColumn[] = [
    { label: 'Date' },
    { label: 'Ticker', variant: 'ticker' },
    { label: 'P&L ($ US)', variant: 'numeric' },
    { label: '', variant: 'actions' },
    { label: '✓', variant: 'blank', width: '36px' },
  ];
}

describe('skeletons', () => {
  let el: HTMLElement;
  let host: Host;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.autoDetectChanges();
  });

  function show(what: Shown): void {
    host.shown.set(what);
    TestBed.tick();
  }

  it('stacks `count` blocks of the variant, sized as asked and hidden from screen readers', () => {
    const blocks = el.querySelectorAll<HTMLElement>('.stb-skeleton');

    expect(blocks.length).toBe(3);
    expect(blocks[0].classList).toContain('stb-skeleton--chip');
    expect(blocks[0].style.width).toBe('80px');
    expect(blocks[0].style.height).toBe('2rem');
    expect(el.querySelector('ui-skeleton')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('frames the table with its real headers and one ghost row per `rows`', () => {
    show('table');

    const headers = [...el.querySelectorAll('th')].map((th) => th.textContent?.trim());
    expect(headers).toEqual(['Date', 'Ticker', 'P&L ($ US)', '', '✓']);
    expect(el.querySelectorAll('tr[mat-row]').length).toBe(4);
  });

  it('shapes the ghost cells after their column : aligned numbers, chip tickers, empty actions', () => {
    show('table');

    const cells = el.querySelectorAll('tr[mat-row]')[0].querySelectorAll('td');
    expect(cells[1].querySelector('.stb-skeleton--chip')).not.toBeNull();
    expect(cells[2].classList).toContain('stb-col--numeric');
    expect(cells[3].querySelector('ui-skeleton')).toBeNull();
  });

  // A narrow icon column sized by its content : a ghost bar there shifted the columns (#542).
  it('holds a blank column at the width of its real content, without a ghost', () => {
    show('table');

    const cell = el.querySelectorAll('tr[mat-row]')[0].querySelectorAll('td')[4];
    expect(cell.querySelector('ui-skeleton')).toBeNull();
    expect(cell.querySelector<HTMLElement>('.stb-skeleton-spacer')?.style.width).toBe('36px');
  });

  it('marks the region busy and gives it its spoken label', () => {
    show('table');

    const table = el.querySelector('ui-skeleton-table');
    expect(table?.getAttribute('aria-busy')).toBe('true');
    expect(table?.querySelector('.cdk-visually-hidden')?.textContent).toBe('Loading the journal');
  });

  it('lays out one tile per KPI, on the five-column row for five', () => {
    show('kpi');

    expect(el.querySelectorAll('.kpi').length).toBe(5);
    expect(el.querySelector('.kpi-row')?.classList).toContain('kpi-row--five');
  });

  // A page announces « loading » once : its repeats stay silent instead of nameless busy regions.
  it('hides a card without a label from assistive tech, as decoration', () => {
    show('decor');

    const card = el.querySelector('ui-skeleton-card');
    expect(card?.getAttribute('aria-hidden')).toBe('true');
    expect(card?.hasAttribute('aria-busy')).toBe(false);
    expect(card?.querySelector('.cdk-visually-hidden')).toBeNull();
  });

  it('draws a card with a title and its lines, and the lines alone when bare', () => {
    show('card');
    expect(el.querySelector('mat-card')).not.toBeNull();
    expect(el.querySelectorAll('.stb-skeleton--line').length).toBe(2);

    show('bare');
    expect(el.querySelector('mat-card')).toBeNull();
    expect(el.querySelectorAll('.stb-skeleton--line').length).toBe(3);
  });
});
