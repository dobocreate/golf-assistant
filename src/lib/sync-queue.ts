import { get, set, del, entries } from 'idb-keyval';
import { syncStore } from '@/lib/offline-store';

export interface SyncQueueItem {
  id: string;
  action: 'replaceScoreForHole' | 'replaceShotsForHole' | 'replaceCompanionScoresForHole';
  payload: unknown;
  roundId: string;
  holeNumber: number;
  dataVersion: number;
  createdAt: number;
  retryCount: number;
  maxRetries: number;
  status: 'pending' | 'syncing' | 'failed';
  syncingStartedAt: number | null;
}

type EnqueueInput = Omit<SyncQueueItem, 'id' | 'createdAt' | 'retryCount' | 'status' | 'syncingStartedAt'>;

function syncKey(id: string): string {
  return `sync:${id}`;
}

async function getAllItems(): Promise<SyncQueueItem[]> {
  const all = await entries<string, SyncQueueItem>(syncStore);
  return all.map(([, v]) => v);
}

export const syncQueue = {
  async enqueueOrReplace(input: EnqueueInput): Promise<void> {
    const items = await getAllItems();

    const existing = items.find(
      (item) =>
        item.roundId === input.roundId &&
        item.holeNumber === input.holeNumber &&
        item.action === input.action
    );

    if (existing) {
      if (existing.status === 'syncing') {
        // In-flight: add a new item, don't touch the syncing one
        const newItem: SyncQueueItem = {
          ...input,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          retryCount: 0,
          status: 'pending',
          syncingStartedAt: null,
        };
        await set(syncKey(newItem.id), newItem, syncStore);
        return;
      }

      // pending or failed: overwrite with new data, reset retryCount
      const updated: SyncQueueItem = {
        ...existing,
        payload: input.payload,
        dataVersion: input.dataVersion,
        createdAt: Date.now(),
        retryCount: 0,
        status: 'pending',
        syncingStartedAt: null,
      };
      await set(syncKey(existing.id), updated, syncStore);
      return;
    }

    // No existing item: create new
    const newItem: SyncQueueItem = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      retryCount: 0,
      status: 'pending',
      syncingStartedAt: null,
    };
    await set(syncKey(newItem.id), newItem, syncStore);
  },

  async getRetryable(): Promise<SyncQueueItem[]> {
    const items = await getAllItems();
    return items
      .filter(
        (item) =>
          item.status === 'pending' ||
          (item.status === 'failed' && item.retryCount < item.maxRetries)
      )
      .sort((a, b) => a.createdAt - b.createdAt);
  },

  async recoverStale(ttlMs: number): Promise<number> {
    const items = await getAllItems();
    const now = Date.now();
    let recovered = 0;

    for (const item of items) {
      if (
        item.status === 'syncing' &&
        item.syncingStartedAt !== null &&
        item.syncingStartedAt + ttlMs < now
      ) {
        const updated: SyncQueueItem = {
          ...item,
          status: 'pending',
          syncingStartedAt: null,
        };
        await set(syncKey(item.id), updated, syncStore);
        recovered++;
      }
    }

    return recovered;
  },

  async markSyncing(id: string): Promise<void> {
    const item = await get<SyncQueueItem>(syncKey(id), syncStore);
    if (!item) return;

    const updated: SyncQueueItem = {
      ...item,
      status: 'syncing',
      syncingStartedAt: Date.now(),
    };
    await set(syncKey(id), updated, syncStore);
  },

  async markFailed(id: string): Promise<void> {
    const item = await get<SyncQueueItem>(syncKey(id), syncStore);
    if (!item) return;

    const updated: SyncQueueItem = {
      ...item,
      status: 'failed',
      retryCount: item.retryCount + 1,
    };
    await set(syncKey(id), updated, syncStore);
  },

  async remove(id: string): Promise<void> {
    await del(syncKey(id), syncStore);
  },

  async pendingCount(): Promise<number> {
    const items = await getAllItems();
    return items.filter(
      (item) =>
        item.status === 'pending' ||
        (item.status === 'failed' && item.retryCount < item.maxRetries)
    ).length;
  },

  async countByRound(roundId: string): Promise<number> {
    const items = await getAllItems();
    return items.filter((item) => item.roundId === roundId).length;
  },

  /** Reset all failed items for a round back to pending (for manual retry via save button) */
  async resetFailedForRound(roundId: string): Promise<number> {
    const items = await getAllItems();
    let reset = 0;
    for (const item of items) {
      if (item.roundId === roundId && item.status === 'failed') {
        const updated: SyncQueueItem = {
          ...item,
          status: 'pending',
          retryCount: 0,
          syncingStartedAt: null,
        };
        await set(syncKey(item.id), updated, syncStore);
        reset++;
      }
    }
    return reset;
  },
};
