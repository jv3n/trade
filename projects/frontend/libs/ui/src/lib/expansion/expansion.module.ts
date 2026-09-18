import { NgModule } from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';

/**
 * StbExpansionModule — design-system wrapper around Material's [MatExpansionModule].
 * Consumers import this instead of `MatExpansionModule` so token overrides and any future
 * PortfolioAI-specific directives / behaviour live in a single place.
 *
 * Two component flavours :
 *   • `<mat-expansion-panel>`  — single collapsible card, often used for inline disclosure.
 *   • `<mat-accordion>`        — group of panels with optional `multi` (allow several open
 *                                 at once) or `displayMode="flat"` (drop the inter-panel
 *                                 margin) modifiers.
 */
@NgModule({
  imports: [MatExpansionModule],
  exports: [MatExpansionModule],
})
export class StbExpansionModule {}
