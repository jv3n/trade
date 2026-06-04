import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';

// Stories for the Material button design owned by `libs/ui/styles/components/_buttons.scss`.
// The lib has no `UiButton` wrapper — these stories drive `<button mat-button>` /
// `mat-flat-button` / `mat-stroked-button` / `mat-icon-button` directly so iterating on the
// SCSS reflects everywhere in the app on the next reload.

const meta: Meta = {
  title: 'Buttons/Material',
  decorators: [
    moduleMetadata({
      imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
    }),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'Material button variants restyled via CSS custom property overrides in `libs/ui/styles/components/_buttons.scss`. No TS wrapper — touch the SCSS to evolve the design.',
      },
    },
  },
};

export default meta;

type Story = StoryObj;

export const Variants: Story = {
  render: () => ({
    template: `
      <div style="display:flex; gap:0.75rem; flex-wrap:wrap; align-items:center;">
        <button mat-button>Text</button>
        <button mat-flat-button>Filled</button>
        <button mat-stroked-button>Outlined</button>
        <button mat-raised-button>Raised</button>
        <button mat-icon-button aria-label="settings"><mat-icon>settings</mat-icon></button>
      </div>
    `,
  }),
};

export const Disabled: Story = {
  render: () => ({
    template: `
      <div style="display:flex; gap:0.75rem; flex-wrap:wrap; align-items:center;">
        <button mat-button disabled>Text</button>
        <button mat-flat-button disabled>Filled</button>
        <button mat-stroked-button disabled>Outlined</button>
        <button mat-raised-button disabled>Raised</button>
        <button mat-icon-button disabled aria-label="settings"><mat-icon>settings</mat-icon></button>
      </div>
    `,
  }),
};

export const WithIcons: Story = {
  render: () => ({
    template: `
      <div style="display:flex; gap:0.75rem; flex-wrap:wrap; align-items:center;">
        <button mat-button>
          <mat-icon>refresh</mat-icon>
          <span>Refresh</span>
        </button>
        <button mat-flat-button>
          <mat-icon>add</mat-icon>
          <span>Create</span>
        </button>
        <button mat-stroked-button>
          <mat-icon>edit</mat-icon>
          <span>Edit</span>
        </button>
      </div>
    `,
  }),
};

export const Loading: Story = {
  render: () => ({
    template: `
      <div style="display:flex; gap:0.75rem; flex-wrap:wrap; align-items:center;">
        <button mat-flat-button disabled>
          <mat-spinner diameter="16"></mat-spinner>
          <span>Saving…</span>
        </button>
        <button mat-stroked-button disabled>
          <mat-spinner diameter="16"></mat-spinner>
          <span>Loading…</span>
        </button>
      </div>
    `,
  }),
};

export const CTAPrimary: Story = {
  name: 'CTA — primary (replaces .btn-primary)',
  render: () => ({
    template: `
      <button mat-flat-button>
        <mat-icon>auto_awesome</mat-icon>
        <span>Generate narrative</span>
      </button>
    `,
  }),
};

export const CTASecondary: Story = {
  name: 'CTA — secondary (replaces .btn-secondary)',
  render: () => ({
    template: `
      <button mat-stroked-button>
        <mat-icon>edit</mat-icon>
        <span>Open editor</span>
      </button>
    `,
  }),
};

// Side-by-side dark / light to compare button rendering across themes without flipping the
// Storybook background. The right column scopes `[data-theme='light']` on its wrapper so the
// CSS variables cascade — same SCSS, both palettes.
const allVariants = `
  <div style="display:flex; gap:0.75rem; flex-wrap:wrap; align-items:center;">
    <button mat-button>Text</button>
    <button mat-flat-button>Filled</button>
    <button mat-stroked-button>Outlined</button>
    <button mat-icon-button aria-label="settings"><mat-icon>settings</mat-icon></button>
  </div>
`;

export const BothThemes: Story = {
  name: 'Dark vs Light',
  render: () => ({
    template: `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:1px; background:#000; min-height:240px;">
        <div style="padding:1.25rem; background:var(--color-bg);">
          <h4 style="margin:0 0 0.75rem; color:var(--color-text); font-family:var(--font-family); font-size:0.85rem; font-weight:600;">Dark</h4>
          ${allVariants}
        </div>
        <div data-theme="light" style="padding:1.25rem; background:var(--color-bg);">
          <h4 style="margin:0 0 0.75rem; color:var(--color-text); font-family:var(--font-family); font-size:0.85rem; font-weight:600;">Light</h4>
          ${allVariants}
        </div>
      </div>
    `,
  }),
};
