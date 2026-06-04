import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';

import { StbSize, StbSpinnerEnd, type StbButtonSize } from './button.directives';

type Variant =
  | 'mat-button'
  | 'mat-flat-button'
  | 'mat-stroked-button'
  | 'mat-raised-button'
  | 'mat-icon-button';

interface ButtonArgs {
  variant: Variant;
  size: StbButtonSize;
  label: string;
  icon: string;
  disabled: boolean;
  loading: boolean;
  spinnerPosition: 'leading' | 'trailing';
}

const meta: Meta<ButtonArgs> = {
  title: 'Components/Button',
  decorators: [
    moduleMetadata({
      imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, StbSize, StbSpinnerEnd],
    }),
  ],
  argTypes: {
    variant: {
      description: 'Material variant directive applied to the `<button>`.',
      control: 'select',
      options: [
        'mat-button',
        'mat-flat-button',
        'mat-stroked-button',
        'mat-raised-button',
        'mat-icon-button',
      ],
    },
    size: {
      description: 'Lib `[stbSize]` directive — swaps the MDC container height + label size.',
      control: 'inline-radio',
      options: ['xs', 'sm', 'md', 'lg'],
    },
    label: {
      description: 'Button text. Ignored for `mat-icon-button`.',
      control: 'text',
    },
    icon: {
      description:
        'Material icon name (e.g. `add`, `edit`, `auto_awesome`). Leave blank to drop the icon ; required for `mat-icon-button`.',
      control: 'text',
    },
    disabled: { control: 'boolean' },
    loading: {
      description:
        'Replaces the icon with a spinner (or appends one if `spinnerPosition=trailing`).',
      control: 'boolean',
    },
    spinnerPosition: {
      description:
        '`leading` = replaces the icon ; `trailing` = via `[stbSpinnerEnd]` after the label.',
      control: 'inline-radio',
      options: ['leading', 'trailing'],
      if: { arg: 'loading' },
    },
  },
  args: {
    variant: 'mat-flat-button',
    size: 'sm',
    label: 'Click me',
    icon: 'add',
    disabled: false,
    loading: false,
    spinnerPosition: 'leading',
  },
  parameters: {
    docs: {
      description: {
        component:
          'Material button variants restyled via the lib (`libs/ui/src/lib/button/button.scss`), plus two directives carried by `StbButtonModule` : `[stbSize]` (xs / sm / md / lg) and `[stbSpinnerEnd]` (loading spinner at the end of the label). Use the controls panel to flip the playground.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<ButtonArgs>;

/**
 * Interactive playground. The template branches on the `variant` arg so the right Material
 * directive lands on the `<button>` (Angular needs the directive selector at compile time —
 * we can't bind it dynamically, so a `@switch` covers each variant).
 */
export const Default: Story = {
  render: (args) => ({
    props: args,
    template: `
      @switch (variant) {
        @case ('mat-icon-button') {
          <button
            mat-icon-button
            [stbSize]="size"
            [disabled]="disabled"
            [attr.aria-label]="label">
            @if (loading) {
              <mat-spinner diameter="16"></mat-spinner>
            } @else {
              <mat-icon>{{ icon || 'settings' }}</mat-icon>
            }
          </button>
        }
        @case ('mat-button') {
          <button mat-button [stbSize]="size" [disabled]="disabled">
            @if (loading && spinnerPosition === 'leading') {
              <mat-spinner diameter="16"></mat-spinner>
            } @else if (icon && !loading) {
              <mat-icon>{{ icon }}</mat-icon>
            }
            <span>{{ label }}</span>
            @if (loading && spinnerPosition === 'trailing') {
              <mat-spinner stbSpinnerEnd diameter="16"></mat-spinner>
            }
          </button>
        }
        @case ('mat-flat-button') {
          <button mat-flat-button [stbSize]="size" [disabled]="disabled">
            @if (loading && spinnerPosition === 'leading') {
              <mat-spinner diameter="16"></mat-spinner>
            } @else if (icon && !loading) {
              <mat-icon>{{ icon }}</mat-icon>
            }
            <span>{{ label }}</span>
            @if (loading && spinnerPosition === 'trailing') {
              <mat-spinner stbSpinnerEnd diameter="16"></mat-spinner>
            }
          </button>
        }
        @case ('mat-stroked-button') {
          <button mat-stroked-button [stbSize]="size" [disabled]="disabled">
            @if (loading && spinnerPosition === 'leading') {
              <mat-spinner diameter="16"></mat-spinner>
            } @else if (icon && !loading) {
              <mat-icon>{{ icon }}</mat-icon>
            }
            <span>{{ label }}</span>
            @if (loading && spinnerPosition === 'trailing') {
              <mat-spinner stbSpinnerEnd diameter="16"></mat-spinner>
            }
          </button>
        }
        @case ('mat-raised-button') {
          <button mat-raised-button [stbSize]="size" [disabled]="disabled">
            @if (loading && spinnerPosition === 'leading') {
              <mat-spinner diameter="16"></mat-spinner>
            } @else if (icon && !loading) {
              <mat-icon>{{ icon }}</mat-icon>
            }
            <span>{{ label }}</span>
            @if (loading && spinnerPosition === 'trailing') {
              <mat-spinner stbSpinnerEnd diameter="16"></mat-spinner>
            }
          </button>
        }
      }
    `,
  }),
};
