export const SECURE_KEYS = {
  apiUrl: 'lupira.assistant.assistantApiUrl',
  authMode: 'lupira.assistant.authMode',
  debugEnabled: 'lupira.assistant.debugEnabled',

  userSub: 'lupira.assistant.oidc.userSub',
  userName: 'lupira.assistant.oidc.userName',

  /** The full `{keyId:N}.{secret}` ingest key. SECRET — never log it. */
  apiKey: 'lupira.assistant.apiKey',
} as const;
