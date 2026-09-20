// @ts-check
//
// ESLint flat config for the workspace. Prettier owns formatting : `eslint-config-prettier` is
// applied last to switch off every rule that would overlap it.
//
// `recommended-type-checked` is deliberately left out — much stricter, but 5-10× slower since it
// needs full type resolution.
const eslint = require('@eslint/js');
const { defineConfig, globalIgnores } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const prettier = require('eslint-config-prettier');

module.exports = defineConfig([
  globalIgnores(['dist/**', 'coverage/**', 'libs/ui/.storybook/**']),

  // ======== ALL PROJECTS (TS) ========
  {
    files: ['apps/**/*.ts', 'libs/**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
      prettier,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      // Allow `_`-prefixed args / vars to opt out of the unused-vars check — useful for abstract
      // method signatures we have to declare (e.g. test mock classes that extend a port) but
      // whose body doesn't touch the param.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // ======== ALL PROJECTS (templates) ========
  {
    files: ['apps/**/*.html', 'libs/**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },

  // ======== apps/web — selector prefix `app` ========
  {
    files: ['apps/web/**/*.ts'],
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
    },
  },

  // ======== libs/ui — selector prefixes `ui` (Storybook demo components) + `stb` (design-system
  //                     directives & wrapped surfaces, e.g. `[stbSize]`, `[stbCol]`, `[stbChip]`) ========
  {
    files: ['libs/ui/**/*.ts'],
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: ['ui', 'stb'], style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: ['ui', 'stb'], style: 'kebab-case' },
      ],
    },
  },
]);
