# Lupira Assistant Mobile

The **assistant surface** (React Native / Expo): an inbox of proposals the assistant wants approved,
a read-only browser over the captured comms archive, and settings. It reaches the estate through the
repo's own .NET BFF, which fronts assistant-api, comms-api and health-api.

Architecture and conventions mirror the sibling app **LupiraTasksMobile** (Expo SDK 57, layered
`domain → data → sync → state → ui` enforced by `eslint-plugin-boundaries`, Zustand, `expo-sqlite`,
`expo-secure-store`, OIDC via `expo-auth-session`).

UI stack: **react-native-paper 5 (MD3)** via `@danbro96/lupira-expo-paper`, themed in
`src/ui/theme/paperTheme.ts` from `@lupira/assistant-tokens` (which extends `@danbro96/lupira-tokens-core`). See the repo root's `CLAUDE.md` for the conventions that keep the three
Lupira frontends coherent.

---

## Prerequisites

- Node 20+ and npm
- A **custom dev client** (Expo Go cannot run the background task or push). You'll build one with EAS or
  locally via `expo run:*`.
- The assistant BFF reachable, and an Authentik `assistant` OIDC application/provider.

## Setup

```bash
npm install         # at the REPO ROOT — this app is an npm workspace

# Verify the pure logic (no native runtime needed):
npm run typecheck
npm test            # vitest — domain unit tests

# Generate native projects (CNG) and build/run a dev client on a device:
npx expo prebuild
npx expo run:android      # or: npx expo run:ios   (real device recommended)
```

If any native package version drifts from the SDK, reconcile with:

```bash
npx expo install expo-task-manager expo-background-task
```

## Configuration

Edit `src/config/env.ts` and `src/data/auth/oidc-config.ts`:

- `API_PRESETS` — the BFF origin per preset (overridable in-app on the Developer screen).
- `OIDC_ISSUER` / `OIDC_CLIENT_ID` — must match the Authentik `assistant` provider. The redirect URI is
  `lupiraassistant://oauthredirect` (register it on the provider).
- `SENTRY_DSN` — optional; empty disables crash reporting.

The iOS bundle id / Android package (`com.lupira.assistant`) and `scheme` (`lupiraassistant`) live in
`app.config.ts`.

---

## How it works

### Sign-in
Authentik OIDC (PKCE public client); the session lives in the OS secure keystore.

### Store-and-forward acks
- The inbox is one doc in the `@danbro96/lupira-sync-engine` kernel (`sync/inbox-module.ts`); each gesture
  (resolve / answer / read) is an op in the kernel outbox, written in the same transaction that hides its item.
- Ops replay in order per item with `Idempotency-Key` = `clientActionId`, which the hub dedups on. Transient
  failures back off and retry; a rejected gesture is parked (its item stays hidden) and shows in the
  Developer screen's sync state.
- A sync pushes queued acks, then refetches the inbox. Triggered on connectivity regained, app foreground,
  sign-in, pull-to-refresh, push notices and a periodic `expo-background-task`.

---

## Layout

```
src/
  domain/      pure constants and types: API error timeout, seq stream
  data/        expo-sqlite repos (seq, health ingest buffers), mutators, auth ports,
               generated API clients (orval — never hand-edited), push registration
  sync/        the sync engine and its inbox module, the query client
  state/       auth (createAuthStore), the background sync task, inbox and settings hooks (React Query),
               sync status, Zustand archive (conversations/threads/search)
  ui/          screens (inbox, edit-proposal, conversations, thread, archive search, connectors,
               preferences, settings, sign-in), navigation, theme, shared components
  config/      cross-cutting leaf (env + secure keys); logger, toast/haptics, Paper kit and OIDC come
               from the @danbro96/lupira-* packages
```

Assistant gestures (approve / edit / dismiss / answer) apply optimistically and queue in the sync
engine's outbox, so the inbox works offline. Online-only reads use `onlineQuery`, persisted for the
`assistant` and `comms` key roots.

The layered import graph is enforced by `eslint.config.mjs`. The headless background task
(`state/background-sync-task.ts`) imports only the engine and the auth store, never `ui`, keeping its
dependency cone small.

---

## Smart ring (not wired)

The `pending_ring` / `pending_summaries` tables, their repos and the `ingestRingSamples` / `ingestSummaries`
clients exist; nothing writes them and the sync engine drains `acks` only.

## Testing & verification

- **Unit (`npm test`)**: the auth and archive stores and the icon catalog here; the inbox mapping /
  edit-spec logic in `packages/domain`. Node env, `*.test.ts` — no UI tests.
- **Device (dev client)**: offline ack queue → reconnect drain → idempotent replay, background-task
  delivery after a kill, push token registration and tap routing, inbox approve/edit/dismiss
  round-trip, thread scroll + jump-to-message, EditProposal across all payload kinds, light↔dark.
