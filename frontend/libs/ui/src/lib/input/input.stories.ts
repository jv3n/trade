import { Component } from '@angular/core';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';

import { StbFormFieldModule } from '../form-field';
import { StbIconModule } from '../icon';
import { StbInputModule } from '../input';

type Kind = 'input' | 'textarea';
type InputType = 'text' | 'number' | 'email' | 'password' | 'search' | 'tel' | 'url';
type Appearance = 'outline' | 'fill';

interface InputArgs {
  kind: Kind;
  appearance: Appearance;
  type: InputType;
  label: string;
  placeholder: string;
  value: string;
  hint: string;
  prefixIcon: string;
  suffixIcon: string;
  disabled: boolean;
  readonly: boolean;
  required: boolean;
  showError: boolean;
}

@Component({
  selector: 'ui-input-demo',
  standalone: true,
  imports: [StbFormFieldModule, StbIconModule, StbInputModule],
  template: `
    <mat-form-field [appearance]="appearance" subscriptSizing="dynamic">
      <mat-label>{{ label }}</mat-label>

      @if (prefixIcon) {
        <mat-icon matPrefix>{{ prefixIcon }}</mat-icon>
      }

      @switch (kind) {
        @case ('textarea') {
          <textarea
            matInput
            rows="3"
            [placeholder]="placeholder"
            [value]="value"
            [disabled]="disabled"
            [readonly]="readonly"
            [required]="required"
          ></textarea>
        }
        @default {
          <input
            matInput
            [type]="type"
            [placeholder]="placeholder"
            [value]="value"
            [disabled]="disabled"
            [readonly]="readonly"
            [required]="required"
          />
        }
      }

      @if (suffixIcon) {
        <mat-icon matSuffix>{{ suffixIcon }}</mat-icon>
      }

      @if (hint) {
        <mat-hint>{{ hint }}</mat-hint>
      }
      @if (showError) {
        <mat-error>Looks like an invalid value.</mat-error>
      }
    </mat-form-field>
  `,
})
class Demo implements InputArgs {
  kind: Kind = 'input';
  appearance: Appearance = 'outline';
  type: InputType = 'text';
  label = 'Ticker';
  placeholder = 'AAPL';
  value = '';
  hint = '';
  prefixIcon = '';
  suffixIcon = '';
  disabled = false;
  readonly = false;
  required = false;
  showError = false;
}

const meta: Meta<Demo> = {
  title: 'Components/Input',
  component: Demo,
  decorators: [moduleMetadata({ imports: [] })],
  argTypes: {
    kind: {
      description: 'Render a single-line `<input matInput>` or a multi-line `<textarea matInput>`.',
      control: 'inline-radio',
      options: ['input', 'textarea'],
    },
    appearance: {
      description: 'Material `<mat-form-field>` appearance.',
      control: 'inline-radio',
      options: ['outline', 'fill'],
    },
    type: {
      description: 'Native HTML input type. Ignored when `kind=textarea`.',
      control: 'select',
      options: ['text', 'number', 'email', 'password', 'search', 'tel', 'url'],
      if: { arg: 'kind', neq: 'textarea' },
    },
    label: { control: 'text' },
    placeholder: { control: 'text' },
    value: { control: 'text' },
    hint: {
      description: 'Hint text rendered under the field via `<mat-hint>`.',
      control: 'text',
    },
    prefixIcon: {
      description:
        'Material icon name rendered as `matPrefix`. Leave blank to drop it. Try `search`, `attach_money`.',
      control: 'text',
    },
    suffixIcon: {
      description:
        'Material icon name rendered as `matSuffix`. Leave blank to drop it. Try `visibility`, `close`.',
      control: 'text',
    },
    disabled: { control: 'boolean' },
    readonly: { control: 'boolean' },
    required: {
      description: 'Adds the required asterisk to the label and the native `required` attribute.',
      control: 'boolean',
    },
    showError: {
      description: 'Force-render a `<mat-error>` slot (the field stays invalid for the demo).',
      control: 'boolean',
    },
  },
  args: {
    kind: 'input',
    appearance: 'outline',
    type: 'text',
    label: 'Ticker',
    placeholder: 'AAPL',
    value: '',
    hint: '',
    prefixIcon: '',
    suffixIcon: '',
    disabled: false,
    readonly: false,
    required: false,
    showError: false,
  },
  parameters: {
    docs: {
      description: {
        component:
          'Plain text input + textarea, restyled via the parent `<mat-form-field>` (cf. `libs/ui/src/lib/form-field/form-field.scss` — that is where the visual contract lives, MatInput itself ships no tokens). Use the controls panel to flip kind / appearance / type / prefix / suffix / hint / error / disabled / readonly / required. For numeric fields use the `appNumberMask` directive in `apps/web/shared/`. For Signal Forms binding, see the journal dialog.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<Demo>;

export const Default: Story = {};
