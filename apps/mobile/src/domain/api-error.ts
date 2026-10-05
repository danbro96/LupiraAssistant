import { ApiError } from '@danbro96/lupira-http/apiError';

// Ingest 401: device key revoked → stop uploading, prompt re-registration (no OIDC re-auth on ingest path).
export class DeviceKeyInvalidError extends ApiError {
  constructor(message = 'Device key rejected (401) — re-register this device.') {
    super(401, message);
    this.name = 'DeviceKeyInvalidError';
  }
}

export const REQUEST_TIMEOUT_MS = 15_000;
