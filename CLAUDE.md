# LupiraAssistant — agent notes

- **Monorepo** (npm workspaces, mirrors LupiraCal): `apps/mobile` (the
  canonical surface), `packages/domain` (`@lupira/assistant-domain`), `packages/tokens`
  (`@lupira/assistant-tokens`), `src/LupiraAssistantBff` (.NET 10 BFF fronting assistant-api,
  comms-api, location-api and health-api). **No web SPA exists yet** — it is deferred in `docs/roadmap.md`; the tokens package is
  already shaped for it. Pre-release: v0.1.0, no tags, no EAS builds, BFF not deployed.
- **Two products in one app**: the assistant surface (inbox of proposals, comms archive browser,
  settings) and the household telemetry collector (background GPS → NDJSON store-and-forward).
- **Offline-first, both paths.** Assistant gestures apply optimistically → inbox cache + a queued ack
  on the pending-acks stream; fixes go to a SQLite buffer with a crash-safe monotonic `seq`. Both drain
  through `sync/sync-engine`.
- **Layering** (downward-only, `eslint-plugin-boundaries` v7): `domain → data → sync → state → ui`,
  with `collector` beside `sync`, and `config`/`debug`/`feedback`/`polyfills` as leaves. See
  `apps/mobile/eslint.config.mjs` — its header comment is the authority.
- **The headless cone must stay UI-free.** `index.ts` registers `collector/location-task` and
  `sync/background-upload-task` at module top level, so they load in the OS's bare JS context during
  cold start. Nothing Paper-flavored may reach them: mount `PaperProvider` strictly inside `App.tsx`
  (boundaries already forbids `collector`/`sync` → `ui`).
- **API clients are generated**: orval → `src/data/api/generated/` (never hand-edit). `client: 'fetch'`,
  not react-query — assistant reads come from the BFF and the inbox cache.
- **One origin — the BFF** (CalWeb's shape): every call, device ingest included, goes through
  `src/LupiraAssistantBff`; only `exposed.json` entries are routed. A new upstream endpoint the app
  calls needs a line there. `API_PRESETS` in `config/env.ts` holds that one origin per preset;
  Settings → Developer switches at runtime. `authMode: 'dev'` swaps the bearer for `X-Dev-User`,
  which the BFF and every upstream accept only in Development. The emulator
  preset uses `10.0.2.2` — a LAN IP is unreachable from one.
- **Picker choice is by option-set shape, not by app**: `SegmentedPicker` (Paper `SegmentedButtons`)
  for a fixed 2–5 required set; `ChoiceChips` (a wrapping Paper `Chip` row) for dynamic/unbounded sets
  and for clearable single-select. Each lives only where it is used — copy it across when a second app
  needs one, and keep the copies byte-identical.
- **Settings** is composed from `List.Subheader` + `List.Item` — the same shape as the sibling apps;
  the label/value `Row` is a `List.Item` with a `right` slot.
- **Diagnostics**: `debug/log.ts` (redacted zustand buffer + Sentry breadcrumbs), `DebugLogScreen` and `DeveloperScreen` are shared with the sibling apps; Settings gates them on `debugEnabled` (`state/prefs-store.ts`).
- **UI stack**: react-native-paper 5 (MD3), themed in `ui/theme/paperTheme.ts` from
  `@lupira/assistant-tokens`; React Navigation themes come from `adaptNavigationTheme`. Paper covers
  the MD3-expressible colors, and the whole palette — including the app's own semantics (`pending`,
  `failed`, `banner*`, `toast*`) — rides on the Paper theme, with `useColors()` a typed accessor over
  `useTheme()`. It stays the app's only color hook: **call `useColors()`, never Paper's `useTheme()`
  directly**, so there is one name for the palette. It must keep returning a module-level object
  (`paperLight.colors`) — components do
  `const c = useColors(); const styles = useMemo(() => makeStyles(c), [c])`, and a fresh object per
  render would defeat that. `useColors` is imported only from `ui/`, which is what keeps Paper out of
  the headless cone. Deriving the palette from `useColorScheme()` instead is what this replaced: it
  was a second source that could disagree with the theme `PaperProvider` holds.
  Icons come from `ui/icons.ts` (Google `MaterialIcons`, the family the SPAs also render) — Paper's
  MCI default is overridden by `settings={paperSettings}` in `App.tsx`, so every `icon=` string must
  be an `ICONS.x` value; a wrong name renders nothing rather than failing the build. Inline glyphs
  inside `<Text>` use `Glyph`. Confirms use `useConfirm()`
  (`ui/components/ConfirmDialog.tsx`); text inputs use `ui/components/TextField.tsx`.
  Tokens mirror the other repos' copies — see DevOps `Guides/design-tokens.md` and its drift check.
- **Stay in step with the sibling Lupira frontends.** Same components, theme wiring and layout;
  match what they already do rather than inventing a local shape. Shared files stay byte-identical.
- **Row components take `styles` as a prop and are `memo`'d** — never a per-row `useMemo(makeStyles)`,
  and never Paper's `useTheme()` per row; that is what keeps list renders cheap.
- **`ui/screens/ThreadScreen.tsx` bubbles stay bespoke `View`s.** No `Card`/`Surface`: the list is
  `inverted`, where elevation renders wrong, and the day-break/`previous`-row coupling and
  `maxWidth: '85%'` alignment are load-bearing.
- **ToastHost is Paper's `Snackbar`**, keyed by the store's `nonce` so an identical repeat message
  remounts and re-arms the timer. The imperative zustand store (callable from `sync`/`state`, haptics
  included) stays in `feedback/toast.ts`; the host only renders it.
- **Topbar**: every root screen shows the navigator's native header — title from `options.title`,
  actions from `headerRight`, and the cog is the shared `SettingsButton`. Never `headerShown: false`
  on a root screen. A screen's own controls (search, period nav, filters) go in `ScreenToolbar`,
  a row *under* the header, not instead of it. Status strips render nothing when healthy.
- **Header actions are declared in the navigator's `options`**; `useLayoutEffect` + `setOptions` only
  when the action gates on screen state (a Save enabled only when dirty).
- No reanimated, and don't add it — this app has no gestures to animate and it would move the Expo
  fingerprint. Paper 5 is pure JS, so it does not.
- **Test floor**: `domain/` fully covered, plus the `sync/` orchestration (upload cycle, cursor resume,
  pause poll) and `state/` store transitions. UI is verified on a device against a local backend —
  that is what the Developer screen exists for.
- Latest stable deps, bump hard. vitest (node env, `*.test.ts` — pure logic only; no UI tests).
  `packages/tokens` holds only constants, so it has no test script; adding logic there means adding one.
  Comment only the non-obvious *why*; docs = present state.
