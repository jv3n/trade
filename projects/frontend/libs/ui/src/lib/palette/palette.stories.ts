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
  <div>
    <span></span>
    <code>--${token}</code>
  </div>
`;

const grid = (tokens: string[]) => `
  <div>
    ${tokens.map(swatch).join('')}
  </div>
`;

const section = (title: string, tokens: string[]) => `
  <h3>${title}</h3>
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

export const Default: Story = {
  render: () => ({
    template: `
      <div>
        <h2>Dark — GitHub dimmed</h2>
        <p>Default <code>:root</code> tokens (no <code>data-theme</code> set).</p>
        ${allSections}
      </div>
    `,
  }),
};
