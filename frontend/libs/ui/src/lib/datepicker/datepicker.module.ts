import { NgModule } from '@angular/core';
import { MatDatepickerModule } from '@angular/material/datepicker';

/**
 * StbDatePickerModule — design-system wrapper around Material's [MatDatepickerModule].
 *
 * Consumers import this instead of `MatDatepickerModule` so the lib is the single point of
 * configuration for the datepicker — token overrides live in
 * `libs/ui/styles/components/_datepicker.scss`, and any future PortfolioAI-specific behaviour
 * (custom date formats, locale switch, year-month picker shortcut, etc.) gets added here as a
 * declaration without touching every consumer.
 *
 * The [DateAdapter] itself is provided once at the app level via `provideNativeDateAdapter()`
 * in `app.config.ts` — Material 22 looks it up in the Environment Injector, so scoping it to
 * each consumer's `imports[]` would NG0201 inside `MatDialog` (see the datepicker .mdx in
 * Storybook for the full story).
 */
@NgModule({
  imports: [MatDatepickerModule],
  exports: [MatDatepickerModule],
})
export class StbDatePickerModule {}
