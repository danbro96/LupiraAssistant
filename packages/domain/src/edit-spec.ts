// Schema-driven proposal editing: one field-spec table per action kind drives a generic form. The
// payload is edited immutably by path; text input round-trips through fieldToInput/inputToField with
// per-type validation, so the submitted edit always re-parses server-side.

export type FieldType = 'text' | 'multiline' | 'datetime' | 'date' | 'number' | 'boolean' | 'list';

export interface FieldSpec {
  path: readonly string[];
  label: string;
  type: FieldType;
}

const EVENT: FieldSpec[] = [
  { path: ['title'], label: 'Title', type: 'text' },
  { path: ['description'], label: 'Description', type: 'multiline' },
  { path: ['location'], label: 'Location', type: 'text' },
  { path: ['isAllDay'], label: 'All day', type: 'boolean' },
  { path: ['startsAt'], label: 'Starts at', type: 'datetime' },
  { path: ['endsAt'], label: 'Ends at', type: 'datetime' },
  { path: ['startDate'], label: 'Start date', type: 'date' },
  { path: ['endDate'], label: 'End date', type: 'date' },
  { path: ['tags'], label: 'Tags', type: 'list' },
];

const CONTACT: FieldSpec[] = [
  { path: ['givenName'], label: 'Given name', type: 'text' },
  { path: ['familyName'], label: 'Family name', type: 'text' },
  { path: ['nickname'], label: 'Nickname', type: 'text' },
  { path: ['emails'], label: 'Emails', type: 'list' },
  { path: ['phones'], label: 'Phones', type: 'list' },
  { path: ['birthday'], label: 'Birthday', type: 'date' },
  { path: ['tags'], label: 'Tags', type: 'list' },
];

const TASK: FieldSpec[] = [
  { path: ['title'], label: 'Title', type: 'text' },
  { path: ['dueAt'], label: 'Due at', type: 'datetime' },
  { path: ['priority'], label: 'Priority', type: 'number' },
  { path: ['assigneeEmail'], label: 'Assignee', type: 'text' },
  { path: ['bill', 'amount'], label: 'Bill amount', type: 'number' },
  { path: ['bill', 'currency'], label: 'Bill currency', type: 'text' },
  { path: ['bill', 'payee'], label: 'Payee', type: 'text' },
  { path: ['bill', 'invoiceNumber'], label: 'Invoice no.', type: 'text' },
  { path: ['delivery', 'carrier'], label: 'Carrier', type: 'text' },
  { path: ['delivery', 'trackingNumber'], label: 'Tracking no.', type: 'text' },
  { path: ['delivery', 'trackingUrl'], label: 'Tracking URL', type: 'text' },
  { path: ['delivery', 'orderReference'], label: 'Order ref.', type: 'text' },
  { path: ['reply', 'counterparty'], label: 'Reply to', type: 'text' },
  { path: ['reply', 'ask'], label: 'Their ask', type: 'multiline' },
];

const PLACE: FieldSpec[] = [
  { path: ['name'], label: 'Name', type: 'text' },
  { path: ['kind'], label: 'Kind', type: 'text' },
  { path: ['category'], label: 'Category', type: 'text' },
  { path: ['latitude'], label: 'Latitude', type: 'number' },
  { path: ['longitude'], label: 'Longitude', type: 'number' },
  { path: ['formattedAddress'], label: 'Address', type: 'multiline' },
];

export type EditSlot = 'event' | 'contact' | 'task' | 'place';

/** The payload slot an action kind edits, null if not editable. */
export function payloadSlotFor(actionKind: string): EditSlot | null {
  switch (actionKind) {
    case 'CreateEvent':
    case 'UpdateEvent':
      return 'event';
    case 'CreateContact':
    case 'UpdateContact':
      return 'contact';
    case 'CreateTask':
    case 'UpdateTask':
      return 'task';
    case 'CreatePlace':
    case 'UpdatePlace':
      return 'place';
    default:
      return null;
  }
}

export function editSpecFor(actionKind: string): FieldSpec[] | null {
  switch (payloadSlotFor(actionKind)) {
    case 'event':
      return EVENT;
    case 'contact':
      return CONTACT;
    case 'task':
      return TASK;
    case 'place':
      return PLACE;
    default:
      return null;
  }
}

/** Nested fields only render when their parent object exists (a task without a bill shows no bill fields). */
export function visibleFields(spec: readonly FieldSpec[], payload: Record<string, unknown>): FieldSpec[] {
  return spec.filter((f) => f.path.length === 1 || isRecord(payload[f.path[0]]));
}

export function getField(payload: Record<string, unknown>, path: readonly string[]): unknown {
  let cur: unknown = payload;
  for (const key of path) {
    if (!isRecord(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

/** Immutable set-by-path (parents are shallow-copied; missing parents are not invented). */
export function applyEdit(
  payload: Record<string, unknown>,
  path: readonly string[],
  value: unknown,
): Record<string, unknown> {
  if (path.length === 1) return { ...payload, [path[0]]: value };
  const parent = payload[path[0]];
  if (!isRecord(parent)) return payload;
  return { ...payload, [path[0]]: applyEdit(parent, path.slice(1), value) };
}

/** Value → the string an input renders. Booleans use a switch, never text. */
export function fieldToInput(type: FieldType, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (type === 'list') return Array.isArray(value) ? value.join(', ') : '';
  return String(value);
}

export type ParseResult = { ok: true; value: unknown } | { ok: false; error: string };

/** Input string → typed value. Empty input clears the field (null). */
export function inputToField(type: FieldType, raw: string): ParseResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: null };
  switch (type) {
    case 'number': {
      const n = Number(trimmed);
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: 'Not a number' };
    }
    case 'datetime':
      return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed) && !Number.isNaN(Date.parse(trimmed))
        ? { ok: true, value: trimmed }
        : { ok: false, error: 'Use ISO date-time, e.g. 2026-08-07T19:00:00+02:00' };
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) && !Number.isNaN(Date.parse(trimmed))
        ? { ok: true, value: trimmed }
        : { ok: false, error: 'Use YYYY-MM-DD' };
    case 'list':
      return { ok: true, value: trimmed.split(',').map((s) => s.trim()).filter((s) => s.length > 0) };
    default:
      return { ok: true, value: trimmed };
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
