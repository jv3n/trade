import { DecimalPipe } from '@angular/common';
import { Component, signal } from '@angular/core';
import { Sort } from '@angular/material/sort';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';

import { StbSortHeaderModule } from '../sort-header/sort-header.module';
import { StbTableModule } from './table.module';

interface Row {
  ticker: string;
  play: string;
  size: number;
  entry: number;
  exit: number;
  pnl: number;
}

const ROWS: Row[] = [
  { ticker: 'AAPL', play: 'Breakout', size: 100, entry: 185.42, exit: 188.65, pnl: 323.0 },
  { ticker: 'TSLA', play: 'Reversal', size: 50, entry: 248.1, exit: 243.55, pnl: -227.5 },
  { ticker: 'NVDA', play: 'Momentum', size: 25, entry: 482.3, exit: 489.7, pnl: 185.0 },
  { ticker: 'MSFT', play: 'Breakout', size: 75, entry: 412.2, exit: 408.9, pnl: -247.5 },
];

@Component({
  selector: 'ui-table-demo',

  imports: [StbTableModule, StbSortHeaderModule, DecimalPipe],
  template: `
    <div stbTable>
      <table mat-table [dataSource]="sorted()" matSort (matSortChange)="onSort($event)">
        <ng-container matColumnDef="ticker">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="ticker">Ticker</th>
          <td mat-cell *matCellDef="let r" stbCol="mono">{{ r.ticker }}</td>
        </ng-container>
        <ng-container matColumnDef="play">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="play">Play</th>
          <td mat-cell *matCellDef="let r">{{ r.play }}</td>
        </ng-container>
        <ng-container matColumnDef="size">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="size" stbCol="numeric">Size</th>
          <td mat-cell *matCellDef="let r" stbCol="numeric">{{ r.size }}</td>
        </ng-container>
        <ng-container matColumnDef="entry">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="entry" stbCol="numeric">Entry</th>
          <td mat-cell *matCellDef="let r" stbCol="numeric">{{ r.entry | number: '1.2-4' }}</td>
        </ng-container>
        <ng-container matColumnDef="exit">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="exit" stbCol="numeric">Exit</th>
          <td mat-cell *matCellDef="let r" stbCol="numeric">{{ r.exit | number: '1.2-4' }}</td>
        </ng-container>
        <ng-container matColumnDef="pnl">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="pnl" stbCol="numeric">PnL ($)</th>
          <td mat-cell *matCellDef="let r" stbCol="numeric">{{ r.pnl | number: '1.2-2' }}</td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="cols"></tr>
        <tr mat-row *matRowDef="let r; columns: cols"></tr>
      </table>
    </div>
  `,
})
class Demo {
  readonly cols = ['ticker', 'play', 'size', 'entry', 'exit', 'pnl'];
  readonly sorted = signal<Row[]>([...ROWS]);

  onSort(s: Sort): void {
    if (!s.active || s.direction === '') {
      this.sorted.set([...ROWS]);
      return;
    }
    const dir = s.direction === 'asc' ? 1 : -1;
    const key = s.active as keyof Row;
    this.sorted.set(
      [...ROWS].sort((a, b) => {
        const va = a[key];
        const vb = b[key];
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        return String(va).localeCompare(String(vb)) * dir;
      }),
    );
  }
}

const meta: Meta<Demo> = {
  title: 'Components/Table',
  component: Demo,
  decorators: [moduleMetadata({ imports: [] })],
  parameters: {
    docs: {
      description: {
        component:
          'Data table. The `[stbTable]` directive on the wrapping `<div>` adds the surface bg + border + radius. The `[stbCol]` directive on `<th>` / `<td>` carries the cell variant (`numeric` / `mono` / `actions`). Sort headers are wired with `matSort` / `mat-sort-header` from `StbSortHeaderModule` — click any column header to toggle asc / desc / unsorted.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
