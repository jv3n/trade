import { NgModule } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';

/**
 * StbDialogModule — design-system wrapper around Material's [MatDialogModule]. Consumers import this
 * instead of `MatDialogModule` so token overrides and any future PortfolioAI-specific
 * directives / behaviour live in a single place.
 */
@NgModule({
  imports: [MatDialogModule],
  exports: [MatDialogModule],
})
export class StbDialogModule {}
