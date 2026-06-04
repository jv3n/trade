import { NgModule } from '@angular/core';
import { MatSortModule } from '@angular/material/sort';

/**
 * StbSortHeaderModule — design-system wrapper around Material's [MatSortModule].
 *
 * Named after the visible directive — `mat-sort-header` is the styled `<th>` cell that
 * renders the asc / desc arrow ; the parent `matSort` directive on `<table mat-table>` is
 * pure behaviour with no visual surface (cf. `sort-header.scss`).
 *
 * Consumers import this instead of `MatSortModule` so token overrides and any future
 * PortfolioAI-specific directives / behaviour live in a single place.
 */
@NgModule({
  imports: [MatSortModule],
  exports: [MatSortModule],
})
export class StbSortHeaderModule {}
