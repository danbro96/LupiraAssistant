import { defineConfig } from 'orval';

/**
 * Raw typed fetchers (no react-query): the sync layer calls these from headless background tasks, and
 * the UI reads the SQLite mirror — a second, mirror-unaware cache would only fight it.
 *
 * Every target rides the BFF origin; `baseUrl` is the prefix the BFF mounts that upstream at. Specs
 * come from `npm run fetch:openapi`.
 */
const output = (dir: string, mutator: string, baseUrl = '') => ({
  target: `./src/data/api/generated/${dir}/api.ts`,
  schemas: `./src/data/api/generated/${dir}/models`,
  client: 'fetch' as const,
  mode: 'tags-split' as const,
  baseUrl,
  clean: true,
  override: { mutator: { path: './src/data/api/mutators.ts', name: mutator } },
});

export default defineConfig({
  assistant: {
    input: { target: './backend-assistant-openapi.json', filters: { tags: ['Auth', 'Profile', 'Inbox', 'Push'] } },
    output: output('assistant', 'apiFetch', '/api'),
  },
  comms: {
    input: { target: './backend-comms-openapi.json', filters: { tags: ['Archive', 'Topics'] } },
    output: output('comms', 'apiFetch', '/comms-api'),
  },
});
