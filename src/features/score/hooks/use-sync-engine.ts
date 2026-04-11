'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { syncQueue, type SyncQueueItem } from '@/lib/sync-queue';
import { getFromDataStore, setToDataStore, type LocalScore, type LocalShot } from '@/lib/offline-store';
import { upsertScore } from '@/actions/score';
import { replaceShotsForHole } from '@/actions/shot';
import { replaceCompanionScoresForHole } from '@/actions/companion';

type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

/** Check if an error is a network/transient error (should retry) vs permanent (should not) */
function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError && String(err.message).includes('fetch')) return true;
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  return false;
}

function isPermanentError(result: { error?: string }): boolean {
  if (!result.error) return false;
  const msg = result.error;
  // Auth or not-found errors are permanent
  return (
    msg.includes('ログインが必要') ||
    msg.includes('ラウンドが見つかりません') ||
    msg.includes('IDが不正')
  );
}

export function useSyncEngine(roundId: string) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  // Track mounted state to avoid state updates after unmount
  const mountedRef = useRef(true);

  // --- Online/offline listeners ---

  useEffect(() => {
    mountedRef.current = true;

    const handleOnline = () => {
      if (mountedRef.current) setIsOnline(true);
    };
    const handleOffline = () => {
      if (mountedRef.current) {
        setIsOnline(false);
        setSyncStatus('offline');
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- Initialize pendingCount on mount ---

  useEffect(() => {
    syncQueue.countByRound(roundId).then((count) => {
      if (mountedRef.current) setPendingCount(count);
    });
  }, [roundId]);

  // --- Refresh pending count helper ---

  const refreshPendingCount = useCallback(async () => {
    const count = await syncQueue.countByRound(roundId);
    if (mountedRef.current) setPendingCount(count);
  }, [roundId]);

  // --- Update syncedVersion in IndexedDB after successful sync ---

  const updateSyncedVersion = useCallback(
    async (item: SyncQueueItem) => {
      if (item.action === 'replaceScoreForHole') {
        const scores = await getFromDataStore<Map<number, LocalScore>>(
          `scores:${roundId}`,
        );
        if (!scores) return;
        const localScore = scores.get(item.holeNumber);
        if (localScore && localScore.version === item.dataVersion) {
          localScore.syncedVersion = item.dataVersion;
          scores.set(item.holeNumber, localScore);
          await setToDataStore(`scores:${roundId}`, scores);
        }
      } else if (item.action === 'replaceShotsForHole') {
        const shots = await getFromDataStore<Map<number, LocalShot[]>>(
          `shots:${roundId}`,
        );
        if (!shots) return;
        const holeShots = shots.get(item.holeNumber);
        if (holeShots) {
          let changed = false;
          for (const shot of holeShots) {
            if (shot.version === item.dataVersion) {
              shot.syncedVersion = item.dataVersion;
              changed = true;
            }
          }
          if (changed) {
            shots.set(item.holeNumber, holeShots);
            await setToDataStore(`shots:${roundId}`, shots);
          }
        }
      }
      // Companion scores don't have version tracking in IndexedDB
    },
    [roundId],
  );

  // --- syncOne ---

  const syncOne = useCallback(
    async (item: SyncQueueItem): Promise<boolean> => {
      await syncQueue.markSyncing(item.id);

      try {
        let result: { error?: string };

        switch (item.action) {
          case 'replaceScoreForHole': {
            const payload = item.payload as Parameters<typeof upsertScore>[0];
            result = await upsertScore({ ...payload, skipRevalidate: true });
            break;
          }
          case 'replaceShotsForHole': {
            const payload = item.payload as Parameters<typeof replaceShotsForHole>[0];
            result = await replaceShotsForHole({ ...payload, skipRevalidate: true });
            break;
          }
          case 'replaceCompanionScoresForHole': {
            const payload = item.payload as Parameters<typeof replaceCompanionScoresForHole>[0];
            result = await replaceCompanionScoresForHole({
              ...payload,
              skipRevalidate: true,
            });
            break;
          }
          default: {
            // Unknown action type - mark as permanent failure
            await syncQueue.markFailed(item.id);
            return false;
          }
        }

        if (result.error) {
          console.error('[SyncEngine] syncOne failed:', item.action, item.holeNumber, result.error);
          if (isPermanentError(result)) {
            await syncQueue.remove(item.id);
          } else {
            await syncQueue.markFailed(item.id);
          }
          return false;
        }

        // Success
        await syncQueue.remove(item.id);
        await updateSyncedVersion(item);
        return true;
      } catch (err) {
        console.error('[SyncEngine] syncOne threw:', item.action, item.holeNumber, err);
        await syncQueue.markFailed(item.id);
        return false;
      }
    },
    [updateSyncedVersion],
  );

  // --- processQueue ---

  const isSyncingRef = useRef(false);

  const processQueue = useCallback(async (): Promise<{
    synced: number;
    failed: number;
  }> => {
    if (isSyncingRef.current) return { synced: 0, failed: 0 };
    if (!navigator.onLine) {
      if (mountedRef.current) setSyncStatus('offline');
      return { synced: 0, failed: 0 };
    }

    isSyncingRef.current = true;
    if (mountedRef.current) setSyncStatus('syncing');

    let synced = 0;
    let failed = 0;
    let networkError = false;

    try {
      // Recover stale syncing items (stuck for more than 30s)
      await syncQueue.recoverStale(30_000);

      const retryable = await syncQueue.getRetryable();

      for (const item of retryable) {
        // Only process items for this round
        if (item.roundId !== roundId) continue;

        if (networkError) {
          // Stop processing if we hit a network error
          failed++;
          continue;
        }

        try {
          const success = await syncOne(item);
          if (success) {
            synced++;
          } else {
            failed++;
            // Check if this was likely a network error
            if (!navigator.onLine) {
              networkError = true;
            }
          }
        } catch {
          failed++;
          networkError = true;
        }
      }
    } catch (err) {
      console.error('[SyncEngine] processQueue error:', err);
      failed++;
    } finally {
      isSyncingRef.current = false;
    }

    await refreshPendingCount();

    if (mountedRef.current) {
      if (networkError) {
        setSyncStatus('offline');
      } else if (failed > 0) {
        setSyncStatus('error');
      } else {
        setSyncStatus('idle');
      }
    }

    return { synced, failed };
  }, [roundId, syncOne, refreshPendingCount]);

  return {
    syncOne,
    processQueue,
    syncStatus,
    pendingCount,
    isOnline,
  };
}
