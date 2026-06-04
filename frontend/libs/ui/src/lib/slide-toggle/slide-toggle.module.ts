import { NgModule } from '@angular/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

/**
 * StbSlideToggleModule — design-system wrapper around Material's [MatSlideToggleModule].
 *
 * Use it for boolean settings : feature flags, "compact mode", auto-refresh on/off,
 * notification toggles. For radio-style mutually exclusive choices prefer
 * `StbButtonToggleModule` (segmented control) ; for in-form checked state prefer
 * `StbCheckboxModule`.
 *
 * Consumers import this instead of `MatSlideToggleModule` so token overrides and any future
 * PortfolioAI-specific directives / behaviour live in a single place.
 */
@NgModule({
  imports: [MatSlideToggleModule],
  exports: [MatSlideToggleModule],
})
export class StbSlideToggleModule {}
