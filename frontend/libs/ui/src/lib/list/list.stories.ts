import { Component } from '@angular/core';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';

import { StbListModule } from './list.module';
import { StbIconModule } from '../icon';

@Component({
  selector: 'ui-list-demo',
  standalone: true,
  imports: [StbListModule, StbIconModule],
  template: `
    <div>
      <mat-list>
        <mat-list-item>
          <mat-icon matListItemIcon>book</mat-icon>
          <span matListItemTitle>Journal</span>
        </mat-list-item>
        <mat-list-item>
          <mat-icon matListItemIcon>insights</mat-icon>
          <span matListItemTitle>Stats</span>
        </mat-list-item>
        <mat-list-item>
          <mat-icon matListItemIcon>history</mat-icon>
          <span matListItemTitle>History</span>
        </mat-list-item>
      </mat-list>
    </div>
  `,
})
class Demo {}

const meta: Meta<Demo> = {
  title: 'Components/List',
  component: Demo,
  decorators: [moduleMetadata({ imports: [] })],
  parameters: {
    docs: {
      description: {
        component:
          'Vertical list with leading icon + title slots. `<mat-nav-list>` for clickable variants (sidenav).',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
