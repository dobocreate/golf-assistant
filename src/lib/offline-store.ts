import { createStore, get, set, del } from 'idb-keyval';
import type { Score, Shot } from '@/features/score/types';

// --- Stores ---

export const dataStore = createStore('golf-data', 'round-data');
export const syncStore = createStore('golf-sync', 'sync-queue');

// --- Local types (extend DB types with version tracking) ---

export interface LocalScore extends Score {
  version: number;
  syncedVersion: number;
}

export interface LocalShot extends Shot {
  clientId: string;
  version: number;
  syncedVersion: number;
}

// --- Key types ---

export type WriteDataKey =
  | `scores:${string}`
  | `shots:${string}`
  | `companions:${string}`;

export type ReadDataKey =
  | `holes:${string}`
  | `gamePlans:${string}`
  | `clubs:${string}`
  | `roundMeta:${string}`;

export type MapDataKey =
  | `mapPoints:${string}`
  | `elevGrids:${string}`;

export type MetaKey = `meta:${string}`;

export type DataStoreKey = WriteDataKey | ReadDataKey | MapDataKey | MetaKey;

// --- IndexedDB availability check ---

export async function checkIndexedDBAvailability(): Promise<boolean> {
  try {
    const testStore = createStore('golf-test', 'test');
    await set('__test__', 1, testStore);
    await del('__test__', testStore);
    return true;
  } catch {
    return false;
  }
}

// --- Helper functions ---

export async function getFromDataStore<T>(key: string): Promise<T | undefined> {
  return get<T>(key, dataStore);
}

export async function setToDataStore<T>(key: string, value: T): Promise<void> {
  await set(key, value, dataStore);
}

export async function delFromDataStore(key: string): Promise<void> {
  await del(key, dataStore);
}
