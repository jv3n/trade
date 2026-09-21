import { NgModule } from '@angular/core';
import { MatSnackBarModule } from '@angular/material/snack-bar';

/**
 * StbSnackBarModule — design-system wrapper around Material's [MatSnackBarModule].
 *
 * Pages don't need it to show a toast : they inject [StbToast] (root-provided), which opens the
 * Material snack bar with the lib's variants. The module stays for a consumer that wants the raw
 * Material snack bar surface ; the look comes from `snack-bar.scss` either way.
 */
@NgModule({
  imports: [MatSnackBarModule],
  exports: [MatSnackBarModule],
})
export class StbSnackBarModule {}
