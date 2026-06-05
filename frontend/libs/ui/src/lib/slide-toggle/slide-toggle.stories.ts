import { Component } from '@angular/core';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';

import { StbSlideToggleModule } from './slide-toggle.module';

type LabelPos = 'before' | 'after';

interface SlideToggleArgs {
  label: string;
  checked: boolean;
  disabled: boolean;
  labelPosition: LabelPos;
  hideIcon: boolean;
}

@Component({
  selector: 'ui-slide-toggle-demo',

  imports: [StbSlideToggleModule],
  template: `
    <mat-slide-toggle
      [checked]="checked"
      [disabled]="disabled"
      [labelPosition]="labelPosition"
      [hideIcon]="hideIcon"
    >
      {{ label }}
    </mat-slide-toggle>
  `,
})
class Demo implements SlideToggleArgs {
  label = 'Auto-refresh';
  checked = false;
  disabled = false;
  labelPosition: LabelPos = 'after';
  hideIcon = false;
}

const meta: Meta<Demo> = {
  title: 'Components/Slide-toggle',
  component: Demo,
  decorators: [moduleMetadata({ imports: [] })],
  argTypes: {
    label: { control: 'text' },
    checked: { control: 'boolean' },
    disabled: { control: 'boolean' },
    labelPosition: {
      description: 'Render the label `before` (left) or `after` (right) of the toggle.',
      control: 'inline-radio',
      options: ['before', 'after'],
    },
    hideIcon: {
      description: 'Hide the checkmark / line icon inside the knob.',
      control: 'boolean',
    },
  },
  args: {
    label: 'Auto-refresh',
    checked: false,
    disabled: false,
    labelPosition: 'after',
    hideIcon: false,
  },
  parameters: {
    docs: {
      description: {
        component:
          'Boolean toggle — use it for binary settings (feature flags, "compact mode", notifications on/off). For mutually exclusive options use `StbButtonToggleModule` (segmented control) ; for in-form checked state use `StbCheckboxModule`.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
