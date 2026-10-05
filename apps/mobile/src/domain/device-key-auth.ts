// apiKey is the server-issued `{keyId:N}.{secret}` string — send verbatim. Never log the header value.
export function buildDeviceKeyHeader(apiKey: string): string {
  return `DeviceKey ${apiKey}`;
}
