import { NgModule } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';

import { StbChip, StbChipSet } from './chips.directives';

/**
 * StbChipsModule — design-system wrapper around Material's [MatChipsModule], plus the
 * `[stbChip]` directive that exposes domain-specific variants (e.g. `ticker`), and the
 * `[stbChipSet]` one for a set lying on another surface than the page (`paper`).
 *
 * Consumers import this instead of `MatChipsModule` so token overrides, variant classes and
 * any future PortfolioAI-specific behaviour live in a single place.
 */
@NgModule({
  imports: [MatChipsModule, StbChip, StbChipSet],
  exports: [MatChipsModule, StbChip, StbChipSet],
})
export class StbChipsModule {}
