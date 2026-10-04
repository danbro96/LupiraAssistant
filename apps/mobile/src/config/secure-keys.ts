// The device API key + secret are the ONLY truly secret values — keep them under `apiKey` only, never in Zustand/SQLite/AsyncStorage/logs.

export const SECURE_KEYS = {
  apiUrl: 'lupira.assistant.assistantApiUrl',
  authMode: 'lupira.assistant.authMode',
  debugEnabled: 'lupira.assistant.debugEnabled',

  userSub: 'lupira.assistant.oidc.userSub',
  userName: 'lupira.assistant.oidc.userName',

  /** The full `{keyId:N}.{secret}` ingest key. SECRET — never log it. */
  apiKey: 'lupira.assistant.apiKey',
  /** Public key id (safe to display). */
  keyId: 'lupira.assistant.keyId',
  deviceId: 'lupira.assistant.deviceId',
  healthRecordId: 'lupira.assistant.healthRecordId',
  deviceLabel: 'lupira.assistant.deviceLabel',
  recordSlug: 'lupira.assistant.recordSlug',
} as const;
