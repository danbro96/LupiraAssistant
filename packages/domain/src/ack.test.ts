import { describe, expect, it } from 'vitest';
import { classifyAckStatus, parseAckPayload, type ResolvePayload } from './ack';

describe('classifyAckStatus', () => {
  it('accepts 2xx', () => {
    expect(classifyAckStatus(200)).toBe('accepted');
  });

  it('drops resolved-elsewhere and malformed permanently', () => {
    expect(classifyAckStatus(404)).toBe('permanent');
    expect(classifyAckStatus(409)).toBe('permanent');
    expect(classifyAckStatus(400)).toBe('permanent');
  });

  it('retries auth, throttle, and server errors', () => {
    expect(classifyAckStatus(401)).toBe('transient');
    expect(classifyAckStatus(429)).toBe('transient');
    expect(classifyAckStatus(500)).toBe('transient');
    expect(classifyAckStatus(0)).toBe('transient');
  });
});

describe('parseAckPayload', () => {
  it('round-trips a resolve payload', () => {
    expect(parseAckPayload('resolve', '{"action":"Approve"}')).toEqual({ action: 'Approve' });
  });

  it('round-trips a resolve edit in its slot', () => {
    const payload: ResolvePayload = { action: 'Edit', edits: { event: { title: 'Dinner at 8' } } };
    expect(parseAckPayload('resolve', JSON.stringify(payload))).toEqual(payload);
  });

  it('rejects an unknown resolve action', () => {
    expect(parseAckPayload('resolve', '{"action":"Yeet"}')).toBeNull();
  });

  it('round-trips an answer payload and rejects garbage', () => {
    expect(parseAckPayload('answer', '{"skip":true}')).toEqual({ skip: true });
    expect(parseAckPayload('answer', 'not json')).toBeNull();
  });
});
