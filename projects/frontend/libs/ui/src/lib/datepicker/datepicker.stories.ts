import { Component, signal } from '@angular/core';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { applicationConfig, moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';
import { StbDatePickerModule } from './datepicker.module';

// Stories for the Material datepicker theming. Material's `MatDatepickerInput` is its own
// `ControlValueAccessor` — Signal Forms' `[formField]` would clash with it (both want the
// NG_VALUE_ACCESSOR seat), so the pattern in PortfolioAI is `[value]` + `(dateChange)` with
// a signal-backed model. The stories below mirror that pattern so the visual matches the app.

@Component({
  selector: 'ui-datepicker-demo',

  imports: [MatFormFieldModule, MatIconModule, MatInputModule, StbDatePickerModule],
  template: `
    <div>
      <mat-form-field appearance="outline">
        <mat-label>Trade date</mat-label>
        <input
          matInput
          [matDatepicker]="picker"
          [value]="value()"
          (dateChange)="value.set($event.value)"
        />
        <mat-datepicker-toggle matIconSuffix [for]="picker" />
        <mat-datepicker #picker />
      </mat-form-field>
      <p>
        Bound value : <code>{{ value()?.toISOString() ?? 'null' }}</code>
      </p>
    </div>
  `,
})
class DatepickerDemo {
  readonly value = signal<Date | null>(new Date(2026, 5, 4));
}

const meta: Meta<DatepickerDemo> = {
  title: 'Components/Datepicker',
  component: DatepickerDemo,
  decorators: [
    // `DateAdapter` is registered at the application level (same pattern as
    // `apps/web/src/app/app.config.ts` does in the consumer app — `provideNativeDateAdapter()`
    // there, here scoped to the Storybook preview).
    applicationConfig({ providers: [provideNativeDateAdapter()] }),
    moduleMetadata({ imports: [] }),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Material datepicker themed through the lib. Bind via `[value]` + `(dateChange)` (not `[formField]`) — Material's `MatDatepickerInput` is its own `ControlValueAccessor` and conflicts with Signal Forms' binding.",
      },
    },
  },
};

export default meta;

type Story = StoryObj<DatepickerDemo>;

export const Default: Story = {};
