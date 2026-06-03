// ESLint flat config. This is DEV-ONLY tooling — the shipped app has no build
// step and no runtime dependencies. The goal here is a tight, low-noise gate
// that catches a real bug class (dead imports, unused vars, `==` traps,
// unreachable code) without imposing stylistic churn on a hand-formatted,
// heavily-commented codebase. Formatting is intentionally NOT enforced.

import js from '@eslint/js';
import globals from 'globals';

export default [
  // Never lint vendored/minified third-party code or generated artefacts.
  {
    ignores: [
      'node_modules/**',
      'shared/vendor/**',
      'fonts/**',
      '**/*.min.js',
      // Local-only / gitignored state that must never be linted as source.
      '.chrome-profile/**',
      '.claude/**',
      'dist/**',
    ],
  },

  js.configs.recommended,

  // Shared rules for every first-party source file.
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      // Unused symbols are almost always a dead import or a refactor leftover.
      // `_`-prefixed args/vars are an explicit "intentionally unused" opt-out.
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      // `==`/`!=` are footguns, but `x == null` (null+undefined) is idiomatic
      // and safe — 'smart' permits exactly that and forbids the rest.
      eqeqeq: ['error', 'smart'],
      // Empty blocks usually signal an unfinished branch — but an empty catch is
      // a deliberate "best-effort, failure is fine" idiom used widely here
      // (execCommand, localStorage, dispose()), so it stays allowed.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // Browser app + player + shared widgets run in the DOM.
  {
    files: ['admin/**/*.js', 'shared/**/*.js', 'player/**/*.js', '*.js'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },

  // Node-side scripts: dev server, build tooling.
  {
    files: ['server.mjs', 'tools/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Test files load in BOTH the browser suite (test/index.html) and headlessly
  // under Node (test/run-node.mjs), so they may touch either global set.
  {
    files: ['test/**/*.js', 'test/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
];
