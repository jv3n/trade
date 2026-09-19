import { Component } from '@angular/core';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';

import { StbFormFieldModule } from '../form-field';
import { StbSelectModule } from './select.module';

@Component({
  selector: 'ui-select-demo',

  imports: [StbSelectModule, StbFormFieldModule],
  template: `
    <div>
      <mat-form-field appearance="outline">
        <mat-label>Pattern</mat-label>
        <mat-select value="GUS">
          <mat-option value="GUS">GUS — Gap Up Short</mat-option>
          <mat-option value="DT">DT — Double Top</mat-option>
          <mat-option value="DISCRETIONARY">Discretionary</mat-option>
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
