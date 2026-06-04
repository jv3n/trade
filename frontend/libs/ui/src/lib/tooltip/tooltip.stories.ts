import { Component } from '@angular/core';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';

import { StbTooltipModule } from './tooltip.module';
import { StbButtonModule } from '../button';
import { StbIconModule } from '../icon';

@Component({
  selector: 'ui-tooltip-demo',
  standalone: true,
  imports: [StbTooltipModule, StbButtonModule, StbIconModule],
  template: `
    <div>
      <div>
        <button mat-icon-button [matTooltip]="'Edit'" matTooltipPosition="above">
          <mat-icon>edit</mat-icon>
        </button>
        <button mat-icon-button [matTooltip]="'Delete'" matTooltipPosition="above">
          <mat-icon>delete</mat-icon>
        </button>
        <button mat-stroked-button [matTooltip]="'Click to learn more about how to use this'">
          Hover me
        </button>
      </div>
    </div>
  `,
})
class Demo {}

const meta: Meta<Demo> = {
  title: 'Components/Tooltip',
  component: Demo,
  decorators: [moduleMetadata({ imports: [] })],
  parameters: {
    docs: {
      description: {
        component:
          '`matTooltip` directive — hover / focus reveals a small bubble. `matTooltipPosition` controls placement (`above` / `below` / `left` / `right`).',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
