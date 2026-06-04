import { Component } from '@angular/core';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';

import { StbAutocompleteModule } from './autocomplete.module';
import { FormsModule } from '@angular/forms';
import { StbFormFieldModule } from '../form-field';
import { StbInputModule } from '../input';

@Component({
  selector: 'ui-autocomplete-demo',
  standalone: true,
  imports: [StbAutocompleteModule, FormsModule, StbFormFieldModule, StbInputModule],
  template: `
    <div>
      <mat-form-field appearance="outline">
        <mat-label>Ticker</mat-label>
        <input matInput [matAutocomplete]="auto" placeholder="Type a ticker…" />
        <mat-autocomplete #auto="matAutocomplete">
          @for (t of tickers; track t) {
            <mat-option [value]="t">{{ t }}</mat-option>
          }
        </mat-autocomplete>
      </mat-form-field>
    </div>
  `,
})
class Demo {
  readonly tickers = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA'];
}

const meta: Meta<Demo> = {
  title: 'Components/Autocomplete',
  component: Demo,
  decorators: [moduleMetadata({ imports: [] })],
  parameters: {
    docs: {
      description: {
        component:
          'Material autocomplete — type-ahead suggestions anchored to an `<input>`. Pair with `StbFormFieldModule` + `StbInputModule` for the surrounding chrome.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
