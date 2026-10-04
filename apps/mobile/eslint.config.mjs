import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/** v7 object-selector helper: `to('domain','config')` → [{ to: { element: { type: 'domain' } } }, …]. */
const to = (...types) => types.map((t) => ({ to: { element: { type: t } } }));

// One job: enforce the layered architecture (see the plan / ARCHITECTURE). Only the import-boundary
// rule + hook correctness are on; this is a structural gate, not a style overhaul. The dependency
// graph is downward-only:
//   domain → nothing (pure, node-testable)
//   data → domain
//   collector → data/domain          (the headless background task must NOT reach state/ui/sync)
//   sync → data/domain               (the sync-status store lives IN sync/, so sync never imports state)
//   state → sync/collector/data/domain
//   ui → everything below it
// The cross-cutting leaves (config, debug, feedback) may be imported by anyone but import no app layer.
// The shared @lupira/assistant-domain package arrives as an external import, allowed everywhere (it is
// the bottom layer; its purity is enforced by its own eslint config in packages/domain).
export default [
  {
    ignores: [
      'node_modules/**',
      '*.config.js',
      '*.config.mjs',
      '*.config.ts',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'App.tsx', 'index.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { boundaries, 'react-hooks': reactHooks },
    settings: {
      'boundaries/elements': [
        { type: 'domain', pattern: 'src/domain/**' },
        { type: 'data', pattern: 'src/data/**' },
        { type: 'collector', pattern: 'src/collector/**' },
        { type: 'sync', pattern: 'src/sync/**' },
        { type: 'state', pattern: 'src/state/**' },
        { type: 'ui', pattern: 'src/ui/**' },
        { type: 'config', pattern: 'src/config/**' },
        { type: 'debug', pattern: 'src/debug/**' },
        { type: 'feedback', pattern: 'src/feedback/**' },
        { type: 'polyfills', pattern: 'src/polyfills/**' },
      ],
      'import/resolver': { typescript: { alwaysTryTypes: true } },
    },
    rules: {
      'boundaries/dependencies': ['error', {
        default: 'disallow',
        policies: [
          { from: { element: { type: 'domain' } }, allow: to('domain') },
          { from: { element: { type: 'data' } }, allow: to('data', 'domain', 'config', 'debug', 'feedback') },
          { from: { element: { type: 'collector' } }, allow: to('collector', 'data', 'domain', 'config', 'debug', 'feedback') },
          { from: { element: { type: 'sync' } }, allow: to('sync', 'data', 'domain', 'config', 'debug', 'feedback') },
          { from: { element: { type: 'state' } }, allow: to('state', 'sync', 'collector', 'data', 'domain', 'config', 'debug', 'feedback') },
          { from: { element: { type: 'ui' } }, allow: to('ui', 'state', 'sync', 'collector', 'data', 'domain', 'config', 'debug', 'feedback') },
          { from: { element: { type: 'config' } }, allow: to('config') },
          { from: { element: { type: 'debug' } }, allow: to('debug') },
          { from: { element: { type: 'feedback' } }, allow: to('feedback') },
          { from: { element: { type: 'polyfills' } }, allow: to('polyfills') },
        ],
      }],
      ...reactHooks.configs['recommended-latest'].rules,
    },
  },
];
