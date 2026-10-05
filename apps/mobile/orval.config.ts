import { defineConfig } from 'orval';

/**
 * Raw typed fetchers resolving to the body (no react-query hooks): the sync engine calls these from the
 * headless background task, and the app owns its query keys.
 *
 * Every target rides the BFF origin; `baseUrl` is the prefix the BFF mounts that upstream at. HealthApi
 * is split in two because it serves two auth schemes: the `Ingest` tags use the device key and sit at the
 * upstream's own path (no prefix), everything else the OIDC bearer — and Orval binds one mutator per
 * target. Specs come from `npm run fetch:openapi`.
 */
const output = (dir: string, mutator: string, baseUrl = '') => ({
  target: `./src/data/api/generated/${dir}/api.ts`,
  schemas: `./src/data/api/generated/${dir}/models`,
  client: 'fetch' as const,
  mode: 'tags-split' as const,
  baseUrl,
  clean: true,
  override: {
    mutator: { path: './src/data/api/mutators.ts', name: mutator },
    fetch: { includeHttpResponseReturnType: false },
  },
});

export default defineConfig({
  healthIngest: {
    input: { target: './backend-health-openapi.json', filters: { tags: ['Ingest'] } },
    output: output('health-ingest', 'deviceKeyFetch'),
  },
  health: {
    input: { target: './backend-health-openapi.json', filters: { tags: ['Me', 'HealthRecords'] } },
    output: output('health', 'apiFetch', '/health-api'),
  },
  assistant: {
    input: { target: './backend-assistant-openapi.json', filters: { tags: ['Auth', 'Profile', 'Inbox', 'Push'] } },
    output: output('assistant', 'apiFetch', '/api'),
  },
  comms: {
    input: { target: './backend-comms-openapi.json', filters: { tags: ['Archive', 'Topics'] } },
    output: output('comms', 'apiFetch', '/comms-api'),
  },
});
