import { NgTemplateOutlet } from '@angular/common';
import { Component, booleanAttribute, computed, input, numberAttribute } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';

import { StbTable, type StbTableColVariant } from '../table/table.directives';
import { StbSkeleton } from './skeleton.component';

/** One column of a table skeleton : its real header, and how its ghost cells are shaped. */
export interface StbSkeletonColumn {
  /** The header as the real table shows it — already translated. */
  label: string;
  /**
   * The `stbCol` variant of the real column, `ticker` for a chip-shaped cell, or `blank` for a
   * narrow icon column whose cell holds no ghost.
   */
  variant?: StbTableColVariant | 'ticker' | 'blank';
  /**
   * For a `blank` cell : the width of what the real cell holds (an icon, a small button), kept by
   * an invisible spacer so the column sizes like the real one.
   */
  width?: string;
}

/** Ghost widths vary per cell so the rows don't read as a grid of identical bars. */
function ghostWidth(row: number, col: number): number {
  return 36 + ((row * 7 + col * 13) % 28);
}

/**
 * The first load of a listing (#539) : the real header over ghost rows that follow its columns —
 * numbers right-aligned, tickers chip-shaped, actions empty. Same container as the table it stands
 * for, so nothing moves when the rows land.
 */
@Component({
  selector: 'ui-skeleton-table',
  imports: [MatTableModule, StbTable, StbSkeleton],
  template: `
    <span class="cdk-visually-hidden">{{ label() }}</span>
    <div stbTable>
      <table mat-table [dataSource]="rowIndexes()">
        @for (col of columns(); track $index; let c = $index) {
          <ng-container [matColumnDef]="'c' + c">
            <th mat-header-cell *matHeaderCellDef [class]="cellClass(col)">{{ col.label }}</th>
            <td mat-cell *matCellDef="let r" [class]="cellClass(col)">
              @if (col.variant === 'blank') {
                <span class="stb-skeleton-spacer" [style.width]="col.width ?? null"></span>
              } @else if (col.variant !== 'actions') {
                <ui-skeleton
                  [variant]="col.variant === 'ticker' ? 'chip' : 'text'"
                  [width]="col.variant === 'ticker' ? null : ghostWidth(r, c)"
                />
              }
            </td>
          </ng-container>
        }
        <tr mat-header-row *matHeaderRowDef="columnIds()"></tr>
        <tr mat-row *matRowDef="let r; columns: columnIds()"></tr>
      </table>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
  host: { 'aria-busy': 'true' },
})
export class StbSkeletonTable {
  readonly columns = input.required<readonly StbSkeletonColumn[]>();
  /** Spoken to screen readers in place of the blocks — e.g. « Loading… », translated. */
  readonly label = input.required<string>();
  readonly rows = input(6, { transform: numberAttribute });

  protected readonly columnIds = computed(() => this.columns().map((_, i) => `c${i}`));
  protected readonly rowIndexes = computed(() => Array.from({ length: this.rows() }, (_, i) => i));
  protected readonly ghostWidth = ghostWidth;

  protected cellClass(col: StbSkeletonColumn): string {
    return col.variant && col.variant !== 'ticker' && col.variant !== 'blank'
      ? `stb-col--${col.variant}`
      : '';
  }
}

/** The first load of a KPI row (#539) : per tile a label bar, a value block and a sub-line. */
@Component({
  selector: 'ui-skeleton-kpi-row',
  imports: [MatCardModule, StbSkeleton],
  template: `
    <span class="cdk-visually-hidden">{{ label() }}</span>
    <section class="kpi-row" [class.kpi-row--five]="count() === 5">
      @for (i of tiles(); track i) {
        <mat-card class="kpi" appearance="outlined">
          <ui-skeleton [width]="labelWidth(i)" />
          <ui-skeleton variant="block" class="stb-skeleton-kpi-value" />
          <ui-skeleton variant="line" width="60%" />
        </mat-card>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
  host: { 'aria-busy': 'true' },
})
export class StbSkeletonKpiRow {
  readonly label = input.required<string>();
  readonly count = input(4, { transform: numberAttribute });

  protected readonly tiles = computed(() => Array.from({ length: this.count() }, (_, i) => i));

  protected labelWidth(i: number): string {
    return `${45 + ((i * 11) % 25)}%`;
  }
}

/**
 * The first load of a card (#539) : a title and a few lines. `bare` drops the card itself, for a
 * page whose card is already on screen and only its content is loading.
 */
@Component({
  selector: 'ui-skeleton-card',
  imports: [NgTemplateOutlet, MatCardModule, StbSkeleton],
  template: `
    <span class="cdk-visually-hidden">{{ label() }}</span>
    @if (bare()) {
      <ng-container *ngTemplateOutlet="body" />
    } @else {
      <mat-card appearance="outlined" class="stb-skeleton-card">
        <ng-container *ngTemplateOutlet="body" />
      </mat-card>
    }
    <ng-template #body>
      <ui-skeleton width="40%" class="stb-skeleton-title" />
      @for (i of lineIndexes(); track i) {
        <ui-skeleton variant="line" [width]="lineWidth(i)" />
      }
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
  host: { 'aria-busy': 'true' },
})
export class StbSkeletonCard {
  readonly label = input.required<string>();
  readonly lines = input(3, { transform: numberAttribute });
  readonly bare = input(false, { transform: booleanAttribute });

  protected readonly lineIndexes = computed(() =>
    Array.from({ length: this.lines() }, (_, i) => i),
  );

  protected lineWidth(i: number): string {
    return i === this.lines() - 1 ? '66%' : `${92 - ((i * 8) % 16)}%`;
  }
}
