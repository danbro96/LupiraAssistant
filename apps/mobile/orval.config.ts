import { defineConfig } from 'orval';

/**
 * Raw typed fetchers (no react-query): the collector/sync layers call these from headless background
 * tasks, and the UI reads the SQLite mirror — a second, mirror-unaware cache would only fight it.
 *
 * Every target rides the BFF origin; `baseUrl` is the prefix the BFF mounts that upstream at. LocationApi
 * and HealthApi are each split in two because they serve two auth schemes: the `Ingest` tags use the
 * device key and sit at the upstream's own path (no prefix), everything else the OIDC bearer — and Orval
 * binds one mutator per target. Specs come from `npm run fetch:openapi`.
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
  locationIngest: {
    input: { target: './backend-location-openapi.json', filters: { tags: ['Ingest'] } },
    output: output('location-ingest', 'deviceKeyFetch'),
  },
  location: {
    input: { target: './backend-location-openapi.json', filters: { tags: ['Devices', 'Me'] } },
    output: output('location', 'apiFetch', '/location-api'),
  },
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
