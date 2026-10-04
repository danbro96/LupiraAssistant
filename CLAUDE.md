# LupiraAssistant — agent notes

- BFF pattern: ~/Nextcloud/Familj/DevOps/Guides/bff-pattern.md
- Shared frontend conventions: ~/Nextcloud/Familj/DevOps/Guides/frontend-estate.md (repo-specific deviations below).
- **Monorepo** (npm workspaces, mirrors LupiraCal): `apps/mobile` (the canonical surface), `packages/domain` (`@lupira/assistant-domain`), `packages/tokens` (`@lupira/assistant-tokens`), `src/LupiraAssistantBff`. No web SPA; deferred in `docs/roadmap.md`, the tokens package is already shaped for it. BFF deployment: DevOps `WebApps/lupira-assistant-web`.
- **BFF**: proxy only (no merged contract, no `openapi/`), mobile Authentik JWT bearer (`lupira-assistant`). Upstreams: assistant-api, comms-api, location-api, health-api. `exposed.json` groups: `operations`, `anonymous` (assistant-api OIDC enrollment legs, browser, no bearer; announced via `X-Forwarded-Prefix`), `device` (health/location ingest at the upstream path, key gate in `Auth/DeviceKeyHeader`).
- **One origin — the BFF**, device ingest included. A new upstream endpoint the app calls needs an `exposed.json` line. `API_PRESETS` in `config/env.ts` holds the origin per preset.
- **Two products in one app**: the assistant surface (inbox, comms archive browser, settings) and the household telemetry collector (background GPS → NDJSON store-and-forward).
- **Offline-first, both paths.** Assistant gestures apply optimistically → inbox cache + a queued ack on the pending-acks stream; fixes go to a SQLite buffer with a crash-safe monotonic `seq`. Both drain through `sync/sync-engine`.
- **Layering** (eslint-plugin-boundaries v7): `domain → data → sync → state → ui`, with `collector` beside `sync`, and `config`/`debug`/`feedback`/`polyfills` as leaves. `apps/mobile/eslint.config.mjs` header is the authority.
- **The headless cone must stay UI-free.** `index.ts` registers `collector/location-task` and `sync/background-upload-task` at module top level, loaded in the OS's bare JS context at cold start. `useColors` is imported only from `ui/`, keeping Paper out of the cone.
- **API clients are generated**: orval → `src/data/api/generated/` (never hand-edit), `client: 'fetch'`, not react-query — reads come from the BFF and the inbox cache.
- **Palette**: the app's own semantics (`pending`, `failed`, `banner*`, `toast*`) ride on the Paper theme beside the MD3 colours, from `@lupira/assistant-tokens`.
- **`ui/screens/ThreadScreen.tsx` bubbles stay bespoke `View`s.** No `Card`/`Surface`: the list is `inverted`, where elevation renders wrong, and the day-break/`previous`-row coupling and `maxWidth: '85%'` alignment are load-bearing.
- **ToastHost keyed by the store's `nonce`**, so an identical repeat message remounts and re-arms the timer. The imperative zustand store (callable from `sync`/`state`, haptics included) stays in `feedback/toast.ts`.
- No reanimated: no gestures to animate, and it would move the Expo fingerprint. Paper 5 is pure JS, so it does not.
- **Test floor**: `domain/` fully covered, plus `sync/` orchestration (upload cycle, cursor resume, pause poll) and `state/` store transitions. UI is verified on a device (Developer screen). `packages/tokens` holds only constants, so it has no test script; adding logic there means adding one.
