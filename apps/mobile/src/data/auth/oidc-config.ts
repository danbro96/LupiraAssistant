/** The Authentik public client for this app (PKCE, no secret) — distinct from the confidential `assistant`
 *  provider, which stays the hub's resource server + on-behalf-of client. The token's audience fans out to
 *  lupira-assistant (BFF + assistant-api) + lupira-comms (proxied by the BFF) + lupira-location + lupira-health
 *  (device registration) via the -aud scope mappings. Refresh grants never widen scopes — adding an audience
 *  here only takes effect after a sign-out/in. */
// No trailing slash — expo-auth-session appends `/.well-known/...` verbatim and Authentik 404s the `//`.
export const OIDC_ISSUER = 'https://auth.lupira.com/application/o/lupira-assistant-mobile';
export const OIDC_CLIENT_ID = 'lupira-assistant-mobile';
export const OIDC_SCOPES = [
  'openid',
  'email',
  'profile',
  'offline_access',
  'lupira-assistant-aud',
  'lupira-comms-aud',
  'lupira-location-aud',
  'lupira-health-aud',
];

export const OIDC_SCHEME = 'lupiraassistant';

/** Non-empty path required: a bare scheme normalizes away and expo-auth-session can't match it. */
export const OIDC_REDIRECT_PATH = 'oauthredirect';
