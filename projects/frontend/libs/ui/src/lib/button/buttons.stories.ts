import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';

import { StbSize, StbTone, type StbButtonSize, type StbButtonTone } from './button.directives';

type Variant =
  'mat-button' | 'mat-flat-button' | 'mat-stroked-button' | 'mat-raised-button' | 'mat-icon-button';

interface ButtonArgs {
  variant: Variant;
  size: StbButtonSize;
  tone: StbButtonTone | 'none';
  label: string;
  icon: string;
  disabled: boolean;
  loading: boolean;
}

const meta: Meta<ButtonArgs> = {
  title: 'Components/Button',
  decorators: [
    moduleMetadata({
      imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, StbSize, StbTone],
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
      description: 'Lib `[stbSize]` directive — swaps the Material container height + label size.',
      control: 'inline-radio',
      options: ['xs', 'sm', 'md', 'lg'],
    },
    tone: {
      description:
        'Lib `[stbTone]` directive — semantic colour (colour rule : success / danger for outcomes, warning for warnings, accent for statuses). `none` = default colours.',
      control: 'inline-radio',
      options: ['none', 'accent', 'success', 'warning', 'danger'],
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
      description: 'Replaces the icon with a spinner.',
      control: 'boolean',
    },
  },
  args: {
    variant: 'mat-flat-button',
    size: 'sm',
    tone: 'none',
    label: 'Click me',
    icon: 'add',
    disabled: false,
    loading: false,
  },
  parameters: {
    docs: {
      description: {
        component:
          'Material button variants restyled via the lib (`libs/ui/src/lib/button/button.scss`), plus the directives carried by `StbButtonModule` : `[stbSize]` (xs / sm / md / lg), `[stbTone]` (semantic colour) and `[stbDanger]` (destructive CTA). Use the controls panel to flip the playground.',
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
    props: { ...args, toneOrNull: args.tone === 'none' ? null : args.tone },
    template: `
      @switch (variant) {
        @case ('mat-icon-button') {
          <button
            mat-icon-button
            [stbSize]="size" [stbTone]="toneOrNull"
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
          <button mat-button [stbSize]="size" [stbTone]="toneOrNull" [disabled]="disabled">
            @if (loading) {
              <mat-spinner diameter="16"></mat-spinner>
            } @else if (icon && !loading) {
              <mat-icon>{{ icon }}</mat-icon>
            }
            <span>{{ label }}</span>
          </button>
        }
        @case ('mat-flat-button') {
          <button mat-flat-button [stbSize]="size" [stbTone]="toneOrNull" [disabled]="disabled">
            @if (loading) {
              <mat-spinner diameter="16"></mat-spinner>
            } @else if (icon && !loading) {
              <mat-icon>{{ icon }}</mat-icon>
            }
            <span>{{ label }}</span>
          </button>
        }
        @case ('mat-stroked-button') {
          <button mat-stroked-button [stbSize]="size" [stbTone]="toneOrNull" [disabled]="disabled">
            @if (loading) {
              <mat-spinner diameter="16"></mat-spinner>
            } @else if (icon && !loading) {
              <mat-icon>{{ icon }}</mat-icon>
            }
            <span>{{ label }}</span>
          </button>
        }
        @case ('mat-raised-button') {
          <button mat-raised-button [stbSize]="size" [stbTone]="toneOrNull" [disabled]="disabled">
            @if (loading) {
              <mat-spinner diameter="16"></mat-spinner>
            } @else if (icon && !loading) {
              <mat-icon>{{ icon }}</mat-icon>
            }
            <span>{{ label }}</span>
          </button>
        }
      }
    `,
  }),
};
