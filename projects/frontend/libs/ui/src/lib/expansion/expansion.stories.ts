import { Component } from '@angular/core';
import { Meta, StoryObj } from '@storybook/angular';
import { StbExpansionModule } from './expansion.module';

@Component({
  selector: 'ui-expansion-demo',
  imports: [StbExpansionModule],
  template: `
    <mat-accordion multi>
      <mat-expansion-panel expanded>
        <mat-expansion-panel-header>
          <mat-panel-title>GUS</mat-panel-title>
          <mat-panel-description>Gap ≥ 45 % · Float ≥ 1,5 M</mat-panel-description>
        </mat-expansion-panel-header>
        <p>The content of an open panel.</p>
      </mat-expansion-panel>
      <mat-expansion-panel>
        <mat-expansion-panel-header>
          <mat-panel-title>DT</mat-panel-title>
          <mat-panel-description>Rejection 17-20 %</mat-panel-description>
        </mat-expansion-panel-header>
        <p>A collapsed panel.</p>
      </mat-expansion-panel>
    </mat-accordion>
  `,
})
class Demo {}

const meta: Meta<Demo> = {
  title: 'Components/Expansion',
  component: Demo,
  parameters: {
    docs: {
      description: {
        component:
          'Accordion of expansion panels, styled as cards. `multi` on the accordion lets several panels stay open.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
