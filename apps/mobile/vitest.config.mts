import { defineConfig } from 'vitest/config';

// Pure unit tests for the domain layer (sampling, motion classification, NDJSON serialization,
// batching, receipt application, cursor-drop, seq, fix mapping). These run in a plain node
// environment with no Expo / React Native runtime — domain/ imports nothing native, so a single
// glob suffices. `npm run typecheck` (tsc) covers types across the whole project.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
