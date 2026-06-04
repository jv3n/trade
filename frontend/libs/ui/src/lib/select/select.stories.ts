import { Component } from '@angular/core';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';

import { StbSelectModule } from './select.module';
import { StbFormFieldModule } from '../form-field';

@Component({
  selector: 'ui-select-demo',
  standalone: true,
  imports: [StbSelectModule, StbFormFieldModule],
  template: `
    <div>
      <mat-form-field appearance="outline">
        <mat-label>Pattern</mat-label>
        <mat-select value="GUS">
          <mat-option value="GUS">GUS — Gap Up Stuff</mat-option>
          <mat-option value="FRD">FRD — Front-side Reversal Down</mat-option>
        </mat-select>
      </mat-form-field>
    </div>
  `,
})
class Demo {}

const meta: Meta<Demo> = {
  title: 'Components/Select',
  component: Demo,
  decorators: [moduleMetadata({ imports: [] })],
  parameters: {
    docs: {
      description: {
        component:
          'Dropdown picker. Wrap in `<mat-form-field appearance="outline">` to match the journal form field style.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
