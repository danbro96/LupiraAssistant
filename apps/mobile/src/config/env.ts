
/** Every call goes through the assistant BFF — one origin; the path prefix picks the upstream
 *  (`/api` assistant, `/comms-api`, `/health-api`, device ingest at `/ingest`). */

/** 'dev' = the BFF's bypass; it and every upstream accept an `X-Dev-User` header in Development. */
export type AuthMode = 'oidc' | 'dev';

/** `urls.api` is the primary origin; multi-backend apps add keys. */
export type ApiPreset = {
  key: string;
  label: string;
  urls: { api: string } & Record<string, string>;
  authMode: AuthMode;
};

export const API_PRESETS: ApiPreset[] = [
  {
    key: 'prod',
    label: 'Production',
    urls: { api: 'https://assistant.lupira.com' },
    authMode: 'oidc',
  },
  {
    key: 'lan',
    label: 'LAN dev',
    urls: { api: 'http://192.168.14.108:5183' },
    authMode: 'dev',
  },
  {
    key: 'emulator',
    label: 'Emulator dev',
    urls: { api: 'http://10.0.2.2:5183' },
    authMode: 'dev',
  },
];

/** The upstreams trust X-Dev-User only in Development. */
export const DEV_USER = 'daniel.brostrom@hotmail.se';

export const DEFAULT_AUTH_MODE: AuthMode = 'oidc';

export const DEFAULT_API_URL = API_PRESETS[0].urls.api;

/** Extra screens the Developer screen links to. */
export const DIAGNOSTIC_ROUTES: { route: string; label: string }[] = [
  { route: 'DebugLog', label: 'Debug log' },
];


/** Public client key, safe to commit. Empty disables crash reporting. */
export const SENTRY_DSN = '';
