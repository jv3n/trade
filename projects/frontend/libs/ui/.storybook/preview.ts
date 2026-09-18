import { provideZonelessChangeDetection } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { applicationConfig, type Decorator, type Preview } from '@storybook/angular';

/**
 * Sets `data-theme` on the documentElement so the lib's CSS custom properties switch palette.
 * The default `:root` palette is dark — `data-theme="light"` triggers the light overrides
 * declared in `libs/ui/styles/_tokens.scss`.
 *
 * Storybook toolbar drops a "Theme" dropdown via `globalTypes` below ; this decorator reads
 * the chosen value and applies it imperatively.
 */
const withDataTheme: Decorator = (storyFn, context) => {
  const theme = (context.globals['theme'] as string | undefined) ?? 'dark';
  if (typeof document !== 'undefined') {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }
  return storyFn();
};

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    // Hide the default Storybook `backgrounds` toolbar — our `data-theme` decorator drives
    // the page background via the lib's `--color-bg` token, so a parallel bg switcher would
    // just confuse the user.
    backgrounds: { disable: true },
  },
  globalTypes: {
    theme: {
      description: 'Theme',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: [
          { value: 'dark', title: 'Dark', icon: 'circle' },
          { value: 'light', title: 'Light', icon: 'circlehollow' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'dark',
  },
  decorators: [
    applicationConfig({
      providers: [provideZonelessChangeDetection(), provideAnimations()],
    }),
    withDataTheme,
  ],
};

export default preview;
