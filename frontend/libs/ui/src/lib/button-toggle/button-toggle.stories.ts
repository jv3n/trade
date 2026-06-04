import { Component } from '@angular/core';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';

import { StbButtonToggleModule } from '@portfolioai/ui';

@Component({
  selector: 'ui-button-toggle-demo',
  standalone: true,
  imports: [StbButtonToggleModule],
  template: `
    <div>
      <mat-button-toggle-group [hideSingleSelectionIndicator]="true" value="dark">
        <mat-button-toggle value="dark">Dark</mat-button-toggle>
        <mat-button-toggle value="light">Light</mat-button-toggle>
        <mat-button-toggle value="auto">Auto</mat-button-toggle>
      </mat-button-toggle-group>
    </div>
  `,
})
class Demo {}

const meta: Meta<Demo> = {
  title: 'Components/Button toggle',
  component: Demo,
  decorators: [moduleMetadata({ imports: [] })],
  parameters: {
    docs: {
      description: {
        component:
          'Segmented control — exclusive single-selection by default, multi-select via `multiple`.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
