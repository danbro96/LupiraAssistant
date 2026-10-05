import type { AuthPort } from '@danbro96/lupira-http/authPort';

// Dependency-inversion seams so the data layer reads the live token/key/base URL without importing the state layer.

export interface OidcAuthPort extends AuthPort {
  getAuthMode: () => 'oidc' | 'dev';
}

export interface DeviceKeyPort {
  getApiUrl: () => string;
  getApiKey: () => Promise<string | null>;
}

let oidcPort: OidcAuthPort | null = null;
let devicePort: DeviceKeyPort | null = null;

export function setOidcAuthPort(p: OidcAuthPort): void {
  oidcPort = p;
}

export function oidcAuthPort(): OidcAuthPort {
  if (!oidcPort) throw new Error('OidcAuthPort not registered — import the auth store before using it.');
  return oidcPort;
}

export function setDeviceKeyPort(p: DeviceKeyPort): void {
  devicePort = p;
}

export function deviceKeyPort(): DeviceKeyPort {
  if (!devicePort) throw new Error('DeviceKeyPort not registered — import the auth store before using it.');
  return devicePort;
}
