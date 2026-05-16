// @ts-check
//
// ESLint flat config — Angular 21 + TypeScript-only. Prettier reste seul responsable de la mise
// en forme : `eslint-config-prettier` est appliqué en dernier pour désactiver les règles ESLint
// qui chevaucheraient Prettier (indentation, semis, quotes, …). On n'ajoute volontairement pas
// `recommended-type-checked` côté TS — beaucoup plus strict mais 5-10× plus lent (nécessite la
// résolution de types complète) ; à activer plus tard en session dédiée si on veut serrer.
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const prettier = require('eslint-config-prettier');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
      prettier,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
      // Allow `_`-prefixed args / vars to opt out of the unused-vars check — useful for abstract
      // method signatures we have to declare (e.g. test mock classes that extend a port) but
      // whose body doesn't touch the param.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
