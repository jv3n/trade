import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';

// Stories for the shell layout owned by `libs/ui/styles/_shell.scss`. Material's
// `mat-sidenav-container` is one of the few cases where overriding the look from a global
// stylesheet doesn't work — Material's component CSS is injected at runtime *after* global
// styles and wins on specificity. The lib goes through Material's own theming tokens
// (`--mat-sidenav-container-background-color`, `--mat-sidenav-container-divider-color`,
// `--mat-sidenav-container-shape`) set on `.ui-sidenav` so the rules read our values.

const meta: Meta = {
  title: 'Components/Sidenav',
  decorators: [
    moduleMetadata({
      imports: [MatSidenavModule, MatToolbarModule, MatListModule, MatIconModule],
    }),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "App shell — toolbar on top, sidenav on the left, content on the right. The visible separator is driven by `--color-border-strong` via Material's `--mat-sidenav-container-divider-color` token. The right corners of the sidenav are flattened (`--mat-sidenav-container-shape: 0`) so the edge is straight against the content area.",
      },
    },
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj;

// Shared template — the toolbar / sidenav / content combo, parameterised by a theme wrapper.
// `data-theme` cascades CSS custom properties through children, so the light variant is just
// the same template scoped under `[data-theme='light']`.
const shellTemplate = (themeAttr: string) => `
  <div ${themeAttr}>
    <mat-toolbar>
      <span>PortfolioAI</span>
      <span></span>
      <button mat-icon-button aria-label="theme"><mat-icon>light_mode</mat-icon></button>
      <button mat-icon-button aria-label="settings"><mat-icon>settings</mat-icon></button>
    </mat-toolbar>
    <mat-sidenav-container class="ui-shell">
      <mat-sidenav mode="side" opened class="ui-sidenav" disableClose>
        <mat-nav-list class="sidenav-list">
          <a mat-list-item class="sidenav-active">
            <mat-icon matListItemIcon>book</mat-icon>
            <span matListItemTitle>Journal</span>
          </a>
          <a mat-list-item>
            <mat-icon matListItemIcon>insights</mat-icon>
            <span matListItemTitle>Stats</span>
          </a>
          <a mat-list-item>
            <mat-icon matListItemIcon>history</mat-icon>
            <span matListItemTitle>History</span>
          </a>
        </mat-nav-list>
      </mat-sidenav>
      <mat-sidenav-content>
        <main>
          <h2>Trading journal</h2>
          <p>
            Content panel — the right corners of the sidenav are square because we set
            <code>--mat-sidenav-container-shape: 0</code>.
          </p>
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  </div>
`;

export const Default: Story = {
  render: () => ({ template: shellTemplate('') }),
};
