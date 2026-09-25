import { NgModule } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';

/**
 * StbTabsModule — design-system wrapper around Material's [MatTabsModule] : a tab group whose
 * active tab is underlined in the accent colour, on a hairline divider.
 */
@NgModule({
  imports: [MatTabsModule],
  exports: [MatTabsModule],
})
export class StbTabsModule {}
