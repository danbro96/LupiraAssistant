import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL } from './schema';

// Per-JS-context singleton: the headless background task opens its own connection to the same file; WAL + busy_timeout serialize the writers.

export const DB_NAME = 'lupira-assistant.db';
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export type Db = SQLite.SQLiteDatabase;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = init();
  return dbPromise;
}

async function init(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(SCHEMA_SQL);
  return db;
}

export function boolToInt(v: boolean | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return v ? 1 : 0;
}

export function intToBool(v: number | null | undefined): boolean | null {
  if (v === null || v === undefined) return null;
  return v !== 0;
}
