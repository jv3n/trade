import { NgModule } from '@angular/core';
import { MatCardModule } from '@angular/material/card';

/**
 * StbCardModule — design-system wrapper around Material's [MatCardModule]. Consumers import
 * this instead of `MatCardModule` so token overrides and any future PortfolioAI-specific
 * directives / behaviour live in a single place.
 *
 * Material ships three appearances : `<mat-card appearance="raised">` (default, M3 maps to
 * the **elevated** token set), `<mat-card appearance="filled">`, and
 * `<mat-card appearance="outlined">`. The lib styles all three through `card.scss`.
 */
@NgModule({
  imports: [MatCardModule],
  exports: [MatCardModule],
})
export class StbCardModule {}
