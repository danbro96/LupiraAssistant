import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';
import { createOidcClient } from '@danbro96/lupira-expo-oidc/oidc';
import { REQUEST_TIMEOUT_MS } from '../../domain/api-error';
import { OIDC_CLIENT_ID, OIDC_ISSUER } from './oidc-config';

export const oidc = createOidcClient({
  issuer: OIDC_ISSUER,
  clientId: OIDC_CLIENT_ID,
  timeoutMs: REQUEST_TIMEOUT_MS,
  log: (tag, detail) => logDebug(`oidc:${tag}`, detail),
});
