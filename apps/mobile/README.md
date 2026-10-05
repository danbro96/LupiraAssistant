# Lupira Assistant Mobile

The **assistant surface** (React Native / Expo): an inbox of proposals the assistant wants approved,
a read-only browser over the captured comms archive, and settings. It reaches the estate through the
repo's own .NET BFF, which fronts assistant-api and comms-api.

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
- Inbox gestures (resolve / answer / read) are written to a SQLite `pending_acks` queue with a
  **crash-safe, per-stream monotonic `seq`** (assigned atomically in the same transaction as the insert).
- The queue drains in seq order; the hub dedups on `clientActionId`, so retries are always safe.
  Accepted and permanently rejected rows are deleted; the first transient failure stops the drain.
- Triggered on connectivity regained, app foreground, and a periodic `expo-background-task`.

---

## Layout

```
src/
  domain/      pure constants and types: API error timeout, seq stream
  data/        expo-sqlite repos (seq, inbox cache, pending acks), HTTP core, OIDC auth ports,
               generated API clients (orval — never hand-edited), push registration
  sync/        ack uploader, single-flight sync-engine + triggers, background-upload task,
               the UI-facing sync-status store
  state/       Zustand: auth (OIDC), inbox (feed + grant), archive (conversations/threads/search),
               settings
  ui/          screens (inbox, edit-proposal, conversations, thread, archive search, connectors,
               preferences, settings, sign-in), navigation, theme, shared components
  config/      cross-cutting leaf (env + secure keys); logger, toast/haptics, Paper kit and OIDC come
               from the @danbro96/lupira-* packages
```

Assistant gestures (approve / edit / dismiss / answer) apply optimistically, persist to the inbox
cache, and queue on the acks stream, so the inbox works offline.

The layered import graph is enforced by `eslint.config.mjs`. Notably, the **sync** layer never
imports `state`/`ui`, keeping the headless background JS context's dependency cone small.

---

## Testing & verification

- **Unit (`npm test`)**: the auth and archive stores and the icon catalog here; the inbox mapping /
  edit-spec logic in `packages/domain`. Node env, `*.test.ts` — no UI tests.
- **Device (dev client)**: offline ack queue → reconnect drain → idempotent replay, background-task
  delivery after a kill, push token registration and tap routing, inbox approve/edit/dismiss
  round-trip, thread scroll + jump-to-message, EditProposal across all payload kinds, light↔dark.
