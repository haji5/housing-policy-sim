// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * WORKING_AGREEMENTS.md hard rules, enforced mechanically for the sim core:
 * no Math.random / Date.now / wall-clock reads, no module-level mutable state,
 * and no Node built-ins outside the CLI entry point.
 */
const simDeterminismRules = {
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'random', message: 'Use src/rng.ts (counter-based hashed RNG).' },
    { object: 'Date', property: 'now', message: 'Sim time is the tick counter, never wall-clock.' },
    { object: 'performance', property: 'now', message: 'No wall-clock reads in the sim core.' },
    { object: 'crypto', property: 'getRandomValues', message: 'Use src/rng.ts.' },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: "NewExpression[callee.name='Date']",
      message: 'No Date objects in the sim core; use tick indices.',
    },
    {
      selector: "Program > VariableDeclaration[kind!='const']",
      message: 'No module-level mutable state in the sim core.',
    },
    {
      selector: "Program > ExportNamedDeclaration > VariableDeclaration[kind!='const']",
      message: 'No module-level mutable state in the sim core.',
    },
  ],
  'no-restricted-globals': [
    'error',
    { name: 'process', message: 'Only cli.ts may touch process.' },
    { name: 'window', message: 'The sim core is DOM-free.' },
    { name: 'document', message: 'The sim core is DOM-free.' },
  ],
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        { group: ['node:*', 'fs', 'path', 'os'], message: 'Only cli.ts may use Node built-ins.' },
      ],
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/test-results/**',
      '**/playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['packages/sim/src/**/*.ts'],
    ignores: ['packages/sim/src/cli.ts'],
    languageOptions: { globals: {} },
    rules: simDeterminismRules,
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  prettier,
);
