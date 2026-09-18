import { NgModule } from '@angular/core';
import { MatPaginatorModule } from '@angular/material/paginator';

/**
 * StbPaginatorModule — design-system wrapper around Material's [MatPaginatorModule].
 *
 * Pairs with `StbTableModule` for paged data tables (typically the journal once trade count
 * crosses a screen-worth of rows). Drop a `<mat-paginator>` below the table, wire its
 * `length` / `pageSize` / `pageSizeOptions` inputs, and listen to `(page)` to refetch.
 *
 * Consumers import this instead of `MatPaginatorModule` so token overrides and any future
 * PortfolioAI-specific behaviour live in a single place.
 */
@NgModule({
  imports: [MatPaginatorModule],
  exports: [MatPaginatorModule],
})
export class StbPaginatorModule {}
