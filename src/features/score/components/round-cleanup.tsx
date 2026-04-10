'use client';

import { useState, useEffect, useRef } from 'react';
import { useOfflineStore } from '@/features/score/hooks/use-offline-store';
import { useSyncEngine } from '@/features/score/hooks/use-sync-engine';
import { syncQueue } from '@/lib/sync-queue';

type CleanupState = 'syncing' | 'done' | 'warning';

/**
 * Handles IndexedDB + sync queue cleanup when a round is completed.
 *
 * On mount:
 * 1. Check for pending sync items
 * 2. If pending > 0, try to process the queue
 * 3. If items remain after processing, show a warning
 * 4. If all clear, clean up IndexedDB data for this round
 */
export function RoundCleanup({ roundId }: { roundId: string }) {
  const offlineStore = useOfflineStore(roundId);
  const syncEngine = useSyncEngine(roundId);
  const [cleanupState, setCleanupState] = useState<CleanupState>('syncing');
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      try {
        const count = await syncQueue.countByRound(roundId);

        if (count > 0) {
          await syncEngine.processQueue();
          const remaining = await syncQueue.countByRound(roundId);

          if (remaining > 0) {
            setCleanupState('warning');
            return;
          }
        }

        // All synced (or nothing to sync) - clean up IndexedDB
        await offlineStore.clearRoundData();
        setCleanupState('done');
      } catch (err) {
        console.error('[RoundCleanup] Cleanup failed:', err);
        setCleanupState('warning');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  if (cleanupState === 'warning') {
    return (
      <div className="rounded-lg bg-amber-900/50 border border-amber-700 p-3">
        <p className="text-amber-400 text-sm">
          未同期のデータがあります。電波の良い場所で再度お試しください。
        </p>
      </div>
    );
  }

  // 'syncing' and 'done' show nothing
  return null;
}
