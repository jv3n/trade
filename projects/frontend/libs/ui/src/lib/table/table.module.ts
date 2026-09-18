import { NgModule } from '@angular/core';
import { MatTableModule } from '@angular/material/table';

import { StbCol, StbTable } from './table.directives';

/**
 * StbTableModule — design-system wrapper around Material's [MatTableModule], plus the
 * `[stbTable]` directive (styled `<div>` container) and `[stbCol]` (`numeric` / `mono` /
 * `actions` cell variants).
 *
 * Consumers import this instead of `MatTableModule` so token overrides, layout classes and
 * any future PortfolioAI-specific behaviour live in a single place.
 */
@NgModule({
  imports: [MatTableModule, StbTable, StbCol],
  exports: [MatTableModule, StbTable, StbCol],
})
export class StbTableModule {}
