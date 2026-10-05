# Lupira Assistant — release & distribution

EAS build → Play Console internal testing. Package `com.lupira.assistant`, project
`danbro96/lupiraassistant`; EAS owns the upload key, Play signs.

## Versioning

- `eas.json`: `appVersionSource: remote` + `production.autoIncrement` — EAS owns `versionCode`.
- `version` in `apps/mobile/app.config.ts` is the only human version (`package.json` stays `0.0.0`).
- Settings shows `<version> · dev | embedded | OTA <id>`; Sentry events (when
  `SENTRY_DSN` is set) carry `update_id` and `update_channel` tags.

## Native release

Push to `release/android` (`.github/workflows/mobile-release.yml`): tests → `eas build --profile
production --auto-submit` to the Play internal track → tag `android/v<version>+<versionCode>`.

```bash
git push origin main:release/android
```

Runs only when the push touches `apps/mobile/**`, `packages/**` or the lockfile. Needs an
`EXPO_TOKEN` repo secret and the Play service-account key linked in EAS credentials. The first
release is manual (Play's API cannot create it): upload the AAB from `npm run build:android` in
`apps/mobile`, add testers, share the opt-in link.

Sideloadable APK: `npm run build:preview` (from `apps/mobile`).

## OTA update (JS-only)

Run the **mobile-ota** workflow (branch `production` or `preview`, plus a message), or
`eas update --branch production --message "…"`. Running apps check on launch and on foreground
(max once per 5 min) and reload immediately (`useAutoUpdate`). Runtime version is the native
fingerprint: a native change (module, plugin, permission) needs a native release instead.
