import { Component } from '@angular/core';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';

import { StbButtonModule } from '../button';
import { StbIconModule } from '../icon';
import { StbMenuModule } from './menu.module';

@Component({
  selector: 'ui-menu-demo',

  imports: [StbMenuModule, StbButtonModule, StbIconModule],
  template: `
    <div>
      <button mat-stroked-button type="button" [matMenuTriggerFor]="menu">
        Open menu
        <mat-icon>arrow_drop_down</mat-icon>
      </button>
      <mat-menu #menu="matMenu">
        <button mat-menu-item><mat-icon>edit</mat-icon><span>Edit</span></button>
        <button mat-menu-item><mat-icon>delete</mat-icon><span>Delete</span></button>
        <button mat-menu-item disabled><mat-icon>archive</mat-icon><span>Archive</span></button>
      </mat-menu>
    </div>
  `,
})
class Demo {}

const meta: Meta<Demo> = {
  title: 'Components/Menu',
  component: Demo,
  decorators: [moduleMetadata({ imports: [] })],
  parameters: {
    docs: {
      description: {
        component:
          'Dropdown menu anchored to a trigger button. Used in the toolbar user menu and the language switcher.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
