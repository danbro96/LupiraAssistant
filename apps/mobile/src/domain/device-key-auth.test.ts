import { describe, it, expect } from 'vitest';
import { buildDeviceKeyHeader } from './device-key-auth';

describe('buildDeviceKeyHeader', () => {
  it('formats the header as `DeviceKey {apiKey}` verbatim', () => {
    expect(buildDeviceKeyHeader('0123456789abcdef0123456789abcdef.deadbeef')).toBe(
      'DeviceKey 0123456789abcdef0123456789abcdef.deadbeef',
    );
  });
});
