import { NgModule } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';

import { StbChip } from './chips.directives';

/**
 * StbChipsModule — design-system wrapper around Material's [MatChipsModule], plus the
 * `[stbChip]` directive that exposes domain-specific variants (e.g. `ticker` → success-green
 * palette).
 *
 * Consumers import this instead of `MatChipsModule` so token overrides, variant classes and
 * any future PortfolioAI-specific behaviour live in a single place.
 */
@NgModule({
  imports: [MatChipsModule, StbChip],
  exports: [MatChipsModule, StbChip],
})
export class StbChipsModule {}
