import { provideZonelessChangeDetection } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { applicationConfig, Preview } from '@storybook/angular';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      options: {
        light: { name: 'Light', value: '#FFFFFF' },
        dark: { name: 'Dark', value: '#1E1E1E' },
      },
    },
  },
  initialGlobals: {
    backgrounds: { value: 'light' },
  },
  decorators: [
    applicationConfig({
      providers: [provideZonelessChangeDetection(), provideAnimations()],
    }),
  ],
};

export default preview;
