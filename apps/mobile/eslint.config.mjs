import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/** v7 object-selector helper: `to('domain','config')` → [{ to: { element: { type: 'domain' } } }, …]. */
const to = (...types) => types.map((t) => ({ to: { element: { type: t } } }));
const platform = (source, internalPath) => ({ to: { module: { origin: 'external', source, ...(internalPath && { internalPath }) } } });
const fromEach = (types, allow) => types.map((t) => ({ from: { element: { type: t } }, allow }));
const DATA_UP = ['data', 'collector', 'sync', 'state', 'ui'];

// One job: enforce the layered architecture (see the plan / ARCHITECTURE). Only the import-boundary
// rule + hook correctness are on; this is a structural gate, not a style overhaul. The dependency
// graph is downward-only:
//   domain → nothing (pure, node-testable)
//   data → domain
//   collector → data/domain          (the headless background task must NOT reach state/ui/sync)
//   sync → data/domain               (the sync-status store lives IN sync/, so sync never imports state)
//   state → sync/collector/data/domain
//   ui → everything below it
// The cross-cutting leaf config may be imported by anyone but imports no app layer.
// The shared @lupira/assistant-domain package arrives as an external import, allowed everywhere (it is
// the bottom layer; its purity is enforced by its own eslint config in packages/domain).
// LupiraPlatform (@danbro96) packages sit at the layer their name declares: tokens everywhere, http from
// data up (domain may name its ApiError), the feedback/debug-log/oidc leaves from data up, the Paper kit
// and diagnostics screens from ui only.
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
      ],
      'import/resolver': { typescript: { alwaysTryTypes: true } },
    },
    rules: {
      'boundaries/dependencies': ['error', {
        default: 'disallow',
        policies: [
          { from: { element: { type: 'domain' } }, allow: to('domain') },
          { from: { element: { type: 'data' } }, allow: to('data', 'domain', 'config') },
          { from: { element: { type: 'collector' } }, allow: to('collector', 'data', 'domain', 'config') },
          { from: { element: { type: 'sync' } }, allow: to('sync', 'data', 'domain', 'config') },
          { from: { element: { type: 'state' } }, allow: to('state', 'sync', 'collector', 'data', 'domain', 'config') },
          { from: { element: { type: 'ui' } }, allow: to('ui', 'state', 'sync', 'collector', 'data', 'domain', 'config') },
          { from: { element: { type: 'config' } }, allow: to('config') },
          { allow: [{ to: { module: { origin: ['external', 'core'] } } }] },
          { disallow: [platform('@danbro96/*')] },
          { allow: [platform('@danbro96/lupira-tokens-*')] },
          { from: { element: { type: 'domain' } }, allow: [platform('@danbro96/lupira-http', 'apiError')] },
          ...fromEach(DATA_UP, [
            platform('@danbro96/lupira-http'),
            platform('@danbro96/lupira-expo-feedback'),
            platform('@danbro96/lupira-expo-diagnostics', 'log'),
            platform('@danbro96/lupira-expo-oidc', 'oidc'),
          ]),
          { from: { element: { type: 'ui' } }, allow: [platform(['@danbro96/lupira-expo-paper', '@danbro96/lupira-expo-diagnostics'])] },
        ],
        checkAllOrigins: true,
      }],
      ...reactHooks.configs['recommended-latest'].rules,
    },
  },
];
