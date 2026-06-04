import { Component } from '@angular/core';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';

import { StbToolbarModule } from './toolbar.module';
import { StbIconModule } from '../icon';
import { StbButtonModule } from '../button';

@Component({
  selector: 'ui-toolbar-demo',
  standalone: true,
  imports: [StbToolbarModule, StbIconModule, StbButtonModule],
  template: `
    <div>
      <mat-toolbar>
        <span>PortfolioAI</span>
        <span></span>
        <button mat-icon-button><mat-icon>search</mat-icon></button>
        <button mat-icon-button><mat-icon>settings</mat-icon></button>
      </mat-toolbar>
    </div>
  `,
})
class Demo {}

const meta: Meta<Demo> = {
  title: 'Components/Toolbar',
  component: Demo,
  decorators: [moduleMetadata({ imports: [] })],
  parameters: {
    docs: {
      description: {
        component:
          'App-level top bar. Lives inside `<mat-toolbar>` with native flex children — typically a brand on the left, actions on the right via a `flex:1` spacer.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
