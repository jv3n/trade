import { Component } from '@angular/core';
import { Meta, StoryObj } from '@storybook/angular';
import { StbTabsModule } from './tabs.module';

@Component({
  selector: 'ui-tabs-demo',
  imports: [StbTabsModule],
  template: `
    <mat-tab-group>
      <mat-tab label="Patterns"><p>The first view.</p></mat-tab>
      <mat-tab label="Notes"><p>The second view.</p></mat-tab>
    </mat-tab-group>
  `,
})
class Demo {}

const meta: Meta<Demo> = {
  title: 'Components/Tabs',
  component: Demo,
  parameters: {
    docs: {
      description: {
        component:
          'Switches between views of one page. The active tab is underlined in the accent.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
