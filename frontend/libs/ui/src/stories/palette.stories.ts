import type { Meta, StoryObj } from '@storybook/angular';

// Visualise the design tokens defined in `libs/ui/styles/_tokens.scss`. Each story renders the
// whole palette twice — once with the default (`:root` dark) tokens, once with the
// `[data-theme='light']` override scoped to a wrapper div. Edit the tokens, save, Storybook
// HMR repaints — useful for tuning the GitHub-dimmed dark vs GitHub-light contrast pair.

const meta: Meta = {
  title: 'Design tokens/Palette',
};

export default meta;

type Story = StoryObj;

const swatch = (token: string) => `
  <div style="display:flex; align-items:center; gap:0.75rem; padding:0.4rem 0.6rem; background:var(--color-surface); border:1px solid var(--color-border); border-radius:var(--radius); font-size:0.8rem; color:var(--color-text); font-family:var(--font-family);">
    <span style="display:inline-block; width:1.5rem; height:1.5rem; border-radius:var(--radius-sm); background:var(--${token}); border:1px solid var(--color-border-soft);"></span>
    <code style="font-family:var(--font-mono); color:var(--color-text-muted); font-size:0.72rem;">--${token}</code>
  </div>
`;

const grid = (tokens: string[]) => `
  <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:0.5rem;">
    ${tokens.map(swatch).join('')}
  </div>
`;

const section = (title: string, tokens: string[]) => `
  <h3 style="margin:1.25rem 0 0.5rem; color:var(--color-text); font-family:var(--font-family); font-size:0.95rem; font-weight:600;">${title}</h3>
  ${grid(tokens)}
`;

const surfaceTokens = ['color-bg', 'color-surface', 'color-surface-2', 'color-surface-3'];
const borderTokens = ['color-border', 'color-border-soft'];
const textTokens = ['color-text', 'color-text-muted', 'color-text-dim', 'color-text-faint'];
const brandTokens = ['color-accent', 'color-accent-strong', 'color-accent-soft', 'color-on-accent'];
const semanticTokens = [
  'color-success',
  'color-success-soft',
  'color-warning',
  'color-warning-soft',
  'color-danger',
  'color-danger-soft',
  'color-info',
  'color-info-soft',
  'color-purple',
  'color-purple-soft',
  'color-orange',
  'color-orange-soft',
];

const allSections = `
  ${section('Surfaces', surfaceTokens)}
  ${section('Borders', borderTokens)}
  ${section('Text', textTokens)}
  ${section('Brand', brandTokens)}
  ${section('Semantic', semanticTokens)}
`;

export const Dark: Story = {
  render: () => ({
    template: `
      <div style="padding:1.5rem; background:var(--color-bg); min-height:100vh;">
        <h2 style="margin:0 0 0.5rem; color:var(--color-text); font-family:var(--font-family); font-size:1.1rem;">Dark — GitHub dimmed</h2>
        <p style="margin:0 0 1rem; color:var(--color-text-muted); font-family:var(--font-family); font-size:0.85rem;">Default <code>:root</code> tokens (no <code>data-theme</code> set).</p>
        ${allSections}
      </div>
    `,
  }),
};

export const Light: Story = {
  render: () => ({
    template: `
      <div data-theme="light" style="padding:1.5rem; background:var(--color-bg); min-height:100vh;">
        <h2 style="margin:0 0 0.5rem; color:var(--color-text); font-family:var(--font-family); font-size:1.1rem;">Light — GitHub light</h2>
        <p style="margin:0 0 1rem; color:var(--color-text-muted); font-family:var(--font-family); font-size:0.85rem;">Tokens scoped via <code>[data-theme='light']</code> on the wrapper div.</p>
        ${allSections}
      </div>
    `,
  }),
};

export const SideBySide: Story = {
  name: 'Side by side',
  render: () => ({
    template: `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:1px; background:#000; min-height:100vh;">
        <div style="padding:1.25rem; background:var(--color-bg);">
          <h3 style="margin:0 0 1rem; color:var(--color-text); font-family:var(--font-family); font-size:1rem;">Dark</h3>
          ${section('Surfaces', surfaceTokens)}
          ${section('Brand', brandTokens)}
          ${section('Semantic', semanticTokens)}
        </div>
        <div data-theme="light" style="padding:1.25rem; background:var(--color-bg);">
          <h3 style="margin:0 0 1rem; color:var(--color-text); font-family:var(--font-family); font-size:1rem;">Light</h3>
          ${section('Surfaces', surfaceTokens)}
          ${section('Brand', brandTokens)}
          ${section('Semantic', semanticTokens)}
        </div>
      </div>
    `,
  }),
};
