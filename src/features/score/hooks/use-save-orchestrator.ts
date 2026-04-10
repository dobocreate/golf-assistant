'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useOfflineStore, type HoleInputs } from '@/features/score/hooks/use-offline-store';
import { useSyncEngine } from '@/features/score/hooks/use-sync-engine';
import { syncQueue } from '@/lib/sync-queue';
import {
  getFromDataStore,
  setToDataStore,
  type LocalScore,
  type LocalShot,
} from '@/lib/offline-store';
import { upsertScore } from '@/actions/score';
import { replaceShotsForHole } from '@/actions/shot';
import { replaceCompanionScoresForHole } from '@/actions/companion';

// ---------------------------------------------------------------------------
// SaveOperation types
// ---------------------------------------------------------------------------

type SaveOperation =
  | { type: 'holeSwitch'; prevHole: number; newHole: number }
  | { type: 'saveButton'; holeNumber: number }
  | { type: 'backgroundSave'; holeNumber: number };

// ---------------------------------------------------------------------------
// OperationQueue
// ---------------------------------------------------------------------------

class OperationQueue {
  private queue: SaveOperation[] = [];
  private running = false;
  private executor: (op: SaveOperation) => Promise<void>;
  private onRunningChange?: (running: boolean) => void;

  constructor(
    executor: (op: SaveOperation) => Promise<void>,
    onRunningChange?: (running: boolean) => void,
  ) {
    this.executor = executor;
    this.onRunningChange = onRunningChange;
  }

  enqueue(op: SaveOperation): void {
    // backgroundSave: keep only the latest one (older ones are stale)
    if (op.type === 'backgroundSave') {
      this.queue = this.queue.filter((q) => q.type !== 'backgroundSave');
    }
    this.queue.push(op);
    this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.onRunningChange?.(true);
    try {
      while (this.queue.length > 0) {
        const op = this.queue.shift()!;
        try {
          await this.executor(op);
        } catch (err) {
          console.error('[OperationQueue] Operation failed:', err);
        }
      }
    } finally {
      this.running = false;
      this.onRunningChange?.(false);
    }
  }

  get isProcessing(): boolean {
    return this.running;
  }
}

// ---------------------------------------------------------------------------
// Callback interfaces (exported for consumers)
// ---------------------------------------------------------------------------

export interface ScoreCallbacks {
  /** Collect current React state for a hole as a partial LocalScore. Return null if nothing to save. */
  collectData: (hole: number) => Partial<LocalScore> | null;
  /** Build the server action payload for upsertScore. Return null if nothing changed. */
  buildSyncPayload: (hole: number) => Parameters<typeof upsertScore>[0] | null;
}

export interface ShotCallbacks {
  /** Collect current shots for a hole. Return null if nothing to save. */
  collectData: (hole: number) => LocalShot[] | null;
  /** Build the server action payload for replaceShotsForHole. Return null if nothing changed. */
  buildSyncPayload: (hole: number) => Parameters<typeof replaceShotsForHole>[0] | null;
}

export interface CompanionCallbacks {
  /** Collect current companion inputs for a hole. Return null if nothing to save. */
  collectData: (hole: number) => HoleInputs | null;
  /** Build the server action payload for replaceCompanionScoresForHole. Return null if nothing changed. */
  buildSyncPayload: (hole: number) => Parameters<typeof replaceCompanionScoresForHole>[0] | null;
}

// ---------------------------------------------------------------------------
// Helper: save collected data into IndexedDB with version increment
// ---------------------------------------------------------------------------

async function flushScoreToIDB(
  roundId: string,
  holeNumber: number,
  partial: Partial<LocalScore>,
): Promise<number> {
  const key = `scores:${roundId}`;
  const scores = (await getFromDataStore<Map<number, LocalScore>>(key)) ?? new Map<number, LocalScore>();
  const existing = scores.get(holeNumber);
  const nextVersion = (existing?.version ?? 0) + 1;
  const merged: LocalScore = {
    ...(existing ?? ({} as LocalScore)),
    ...partial,
    version: nextVersion,
    syncedVersion: existing?.syncedVersion ?? 0,
  } as LocalScore;
  scores.set(holeNumber, merged);
  await setToDataStore(key, scores);
  return nextVersion;
}

async function flushShotsToIDB(
  roundId: string,
  holeNumber: number,
  shots: LocalShot[],
): Promise<number> {
  const key = `shots:${roundId}`;
  const all = (await getFromDataStore<Map<number, LocalShot[]>>(key)) ?? new Map<number, LocalShot[]>();
  // Determine next version: max of existing versions + 1
  const existing = all.get(holeNumber);
  const maxExistingVersion = existing
    ? Math.max(0, ...existing.map((s) => s.version))
    : 0;
  const nextVersion = maxExistingVersion + 1;
  // Apply version to all shots
  const versioned = shots.map((s) => ({
    ...s,
    version: nextVersion,
    syncedVersion: s.syncedVersion ?? 0,
  }));
  all.set(holeNumber, versioned);
  await setToDataStore(key, all);
  return nextVersion;
}

async function flushCompanionsToIDB(
  roundId: string,
  holeNumber: number,
  data: HoleInputs,
): Promise<void> {
  const key = `companions:${roundId}`;
  const all = (await getFromDataStore<Map<number, HoleInputs>>(key)) ?? new Map<number, HoleInputs>();
  all.set(holeNumber, data);
  await setToDataStore(key, all);
}

// ---------------------------------------------------------------------------
// useSaveOrchestrator
// ---------------------------------------------------------------------------

export function useSaveOrchestrator(roundId: string) {
  const offlineStore = useOfflineStore(roundId);
  const syncEngine = useSyncEngine(roundId);

  // Callback refs (each feature registers separately)
  const scoreCallbacksRef = useRef<ScoreCallbacks | null>(null);
  const shotCallbacksRef = useRef<ShotCallbacks | null>(null);
  const companionCallbacksRef = useRef<CompanionCallbacks | null>(null);

  // isProcessing state for UI (button disable)
  const [isProcessing, setIsProcessing] = useState(false);

  // Stable ref for roundId
  const roundIdRef = useRef(roundId);
  useEffect(() => {
    roundIdRef.current = roundId;
  }, [roundId]);

  // Keep syncEngine functions in refs to avoid stale closures in the executor
  const syncEngineRef = useRef(syncEngine);
  useEffect(() => {
    syncEngineRef.current = syncEngine;
  }, [syncEngine]);

  // --- collectAndFlush: collect from all registered callbacks and flush to IndexedDB ---

  const collectAndFlush = useCallback(
    async (
      holeNumber: number,
    ): Promise<{
      scoreVersion: number | null;
      shotVersion: number | null;
    }> => {
      let scoreVersion: number | null = null;
      let shotVersion: number | null = null;
      const rid = roundIdRef.current;

      // Score
      try {
        const scoreData = scoreCallbacksRef.current?.collectData(holeNumber);
        if (scoreData) {
          scoreVersion = await flushScoreToIDB(rid, holeNumber, scoreData);
        }
      } catch {
        // Continue with other data types
      }

      // Shots
      try {
        const shotData = shotCallbacksRef.current?.collectData(holeNumber);
        if (shotData) {
          shotVersion = await flushShotsToIDB(rid, holeNumber, shotData);
        }
      } catch {
        // Continue with other data types
      }

      // Companions
      try {
        const companionData = companionCallbacksRef.current?.collectData(holeNumber);
        if (companionData) {
          await flushCompanionsToIDB(rid, holeNumber, companionData);
        }
      } catch {
        // Silent failure - IDB write errors are non-fatal
      }

      return { scoreVersion, shotVersion };
    },
    [],
  );

  // --- trySyncToServer: attempt to sync via server actions, enqueue on failure ---

  const trySyncToServer = useCallback(
    async (holeNumber: number, scoreVersion: number | null, shotVersion: number | null): Promise<void> => {
      const rid = roundIdRef.current;

      // Score sync
      try {
        const scorePayload = scoreCallbacksRef.current?.buildSyncPayload(holeNumber);
        if (scorePayload) {
          const result = await upsertScore({ ...scorePayload, skipRevalidate: true });
          if (result.error) {
            await syncQueue.enqueueOrReplace({
              action: 'replaceScoreForHole',
              payload: scorePayload,
              roundId: rid,
              holeNumber,
              dataVersion: scoreVersion ?? 0,
              maxRetries: 10,
            });
          } else if (scoreVersion != null) {
            // Success: update syncedVersion if version still matches
            await updateScoreSyncedVersion(rid, holeNumber, scoreVersion);
          }
        }
      } catch {
        // Network error - enqueue for retry
        const scorePayload = scoreCallbacksRef.current?.buildSyncPayload(holeNumber);
        if (scorePayload) {
          await syncQueue.enqueueOrReplace({
            action: 'replaceScoreForHole',
            payload: scorePayload,
            roundId: rid,
            holeNumber,
            dataVersion: scoreVersion ?? 0,
            maxRetries: 10,
          }).catch(() => {});
        }
      }

      // Shots sync
      try {
        const shotPayload = shotCallbacksRef.current?.buildSyncPayload(holeNumber);
        if (shotPayload) {
          const result = await replaceShotsForHole({ ...shotPayload, skipRevalidate: true });
          if (result.error) {
            await syncQueue.enqueueOrReplace({
              action: 'replaceShotsForHole',
              payload: shotPayload,
              roundId: rid,
              holeNumber,
              dataVersion: shotVersion ?? 0,
              maxRetries: 10,
            });
          } else if (shotVersion != null) {
            await updateShotSyncedVersion(rid, holeNumber, shotVersion);
          }
        }
      } catch {
        const shotPayload = shotCallbacksRef.current?.buildSyncPayload(holeNumber);
        if (shotPayload) {
          await syncQueue.enqueueOrReplace({
            action: 'replaceShotsForHole',
            payload: shotPayload,
            roundId: rid,
            holeNumber,
            dataVersion: shotVersion ?? 0,
            maxRetries: 10,
          }).catch(() => {});
        }
      }

      // Companion sync
      try {
        const companionPayload = companionCallbacksRef.current?.buildSyncPayload(holeNumber);
        if (companionPayload) {
          const result = await replaceCompanionScoresForHole({
            ...companionPayload,
            skipRevalidate: true,
          });
          if (result.error) {
            await syncQueue.enqueueOrReplace({
              action: 'replaceCompanionScoresForHole',
              payload: companionPayload,
              roundId: rid,
              holeNumber,
              dataVersion: 0, // companions don't have version tracking
              maxRetries: 10,
            });
          }
        }
      } catch {
        const companionPayload = companionCallbacksRef.current?.buildSyncPayload(holeNumber);
        if (companionPayload) {
          await syncQueue.enqueueOrReplace({
            action: 'replaceCompanionScoresForHole',
            payload: companionPayload,
            roundId: rid,
            holeNumber,
            dataVersion: 0,
            maxRetries: 10,
          }).catch(() => {});
        }
      }
    },
    [],
  );

  // --- Executor for the OperationQueue ---

  const executorRef = useRef<((op: SaveOperation) => Promise<void>) | null>(null);
  executorRef.current = async (op: SaveOperation): Promise<void> => {
    switch (op.type) {
      case 'holeSwitch': {
        // 1. Collect & flush prevHole to IndexedDB
        const { scoreVersion, shotVersion } = await collectAndFlush(op.prevHole);
        // 2. Try DB sync for prevHole
        await trySyncToServer(op.prevHole, scoreVersion, shotVersion);
        break;
      }

      case 'saveButton': {
        // 1. Collect & flush to IndexedDB
        const { scoreVersion, shotVersion } = await collectAndFlush(op.holeNumber);
        // 2. Try DB sync
        await trySyncToServer(op.holeNumber, scoreVersion, shotVersion);
        // 3. If queue has pending items, process them too
        try {
          const count = await syncQueue.countByRound(roundIdRef.current);
          if (count > 0) {
            await syncEngineRef.current.processQueue();
          }
        } catch {
          // Queue processing failure is non-fatal
        }
        break;
      }

      case 'backgroundSave': {
        // 1. Flush to IndexedDB (local persistence - the real guarantee)
        const { scoreVersion, shotVersion } = await collectAndFlush(op.holeNumber);

        // 2. If online, attempt keepalive fetch for SCORE ONLY (optimization)
        //    Shots and companions use replace RPC (delete+insert) which causes
        //    race conditions with holeSwitch/saveButton Server Actions.
        //    Score uses upsert (safe to race). Shots/companions are synced
        //    only via holeSwitch/saveButton/onlineRestore (awaited operations).
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          try {
            const scorePayload = scoreCallbacksRef.current?.buildSyncPayload(op.holeNumber);
            if (scorePayload) {
              const { roundId: _r, holeNumber: _h, skipRevalidate: _s, ...scoreFields } = scorePayload;
              fetch('/api/sync', {
                method: 'POST',
                body: JSON.stringify({
                  roundId: roundIdRef.current,
                  holeNumber: op.holeNumber,
                  score: scoreFields,
                }),
                keepalive: true,
                headers: { 'Content-Type': 'application/json' },
              }).catch(() => {
                // Fire-and-forget: failure is acceptable. Data is in IndexedDB.
              });
            }
          } catch {
            // Building payload failed - data is still in IndexedDB
          }
        } else {
          // Offline: enqueue for later sync
          try {
            const scorePayload = scoreCallbacksRef.current?.buildSyncPayload(op.holeNumber);
            if (scorePayload) {
              await syncQueue.enqueueOrReplace({
                action: 'replaceScoreForHole',
                payload: scorePayload,
                roundId: roundIdRef.current,
                holeNumber: op.holeNumber,
                dataVersion: scoreVersion ?? 0,
                maxRetries: 10,
              });
            }

            const shotPayload = shotCallbacksRef.current?.buildSyncPayload(op.holeNumber);
            if (shotPayload) {
              await syncQueue.enqueueOrReplace({
                action: 'replaceShotsForHole',
                payload: shotPayload,
                roundId: roundIdRef.current,
                holeNumber: op.holeNumber,
                dataVersion: shotVersion ?? 0,
                maxRetries: 10,
              });
            }

            const companionPayload = companionCallbacksRef.current?.buildSyncPayload(op.holeNumber);
            if (companionPayload) {
              await syncQueue.enqueueOrReplace({
                action: 'replaceCompanionScoresForHole',
                payload: companionPayload,
                roundId: roundIdRef.current,
                holeNumber: op.holeNumber,
                dataVersion: 0,
                maxRetries: 10,
              });
            }
          } catch {
            // Enqueue failure is non-fatal - data is in IndexedDB
          }
        }
        break;
      }
    }
  };

  // --- Initialize OperationQueue once ---

  const opQueueRef = useRef<OperationQueue | null>(null);
  if (opQueueRef.current === null) {
    opQueueRef.current = new OperationQueue(
      (op) => executorRef.current?.(op) ?? Promise.resolve(),
      setIsProcessing,
    );
  }

  // --- Registration functions (stable refs) ---

  const registerScoreCallbacks = useCallback((cb: ScoreCallbacks): void => {
    scoreCallbacksRef.current = cb;
  }, []);

  const registerShotCallbacks = useCallback((cb: ShotCallbacks): void => {
    shotCallbacksRef.current = cb;
  }, []);

  const registerCompanionCallbacks = useCallback((cb: CompanionCallbacks): void => {
    companionCallbacksRef.current = cb;
  }, []);

  // --- Trigger functions ---

  const onHoleSwitch = useCallback((prevHole: number, newHole: number): void => {
    opQueueRef.current?.enqueue({ type: 'holeSwitch', prevHole, newHole });
  }, []);

  const onSaveButton = useCallback((holeNumber: number): void => {
    opQueueRef.current?.enqueue({ type: 'saveButton', holeNumber });
  }, []);

  const onBackgroundSave = useCallback((holeNumber: number): void => {
    opQueueRef.current?.enqueue({ type: 'backgroundSave', holeNumber });
  }, []);

  const onOnlineRestore = useCallback(async (): Promise<void> => {
    await syncEngineRef.current.processQueue();
  }, []);

  return {
    registerScoreCallbacks,
    registerShotCallbacks,
    registerCompanionCallbacks,

    onHoleSwitch,
    onSaveButton,
    onBackgroundSave,
    onOnlineRestore,

    syncStatus: syncEngine.syncStatus,
    pendingCount: syncEngine.pendingCount,
    isOnline: syncEngine.isOnline,
    isProcessing,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers: update syncedVersion in IndexedDB after successful sync
// ---------------------------------------------------------------------------

async function updateScoreSyncedVersion(
  roundId: string,
  holeNumber: number,
  dataVersion: number,
): Promise<void> {
  const key = `scores:${roundId}`;
  const scores = await getFromDataStore<Map<number, LocalScore>>(key);
  if (!scores) return;
  const localScore = scores.get(holeNumber);
  if (localScore && localScore.version === dataVersion) {
    localScore.syncedVersion = dataVersion;
    scores.set(holeNumber, localScore);
    await setToDataStore(key, scores);
  }
}

async function updateShotSyncedVersion(
  roundId: string,
  holeNumber: number,
  dataVersion: number,
): Promise<void> {
  const key = `shots:${roundId}`;
  const shots = await getFromDataStore<Map<number, LocalShot[]>>(key);
  if (!shots) return;
  const holeShots = shots.get(holeNumber);
  if (!holeShots) return;
  let changed = false;
  for (const shot of holeShots) {
    if (shot.version === dataVersion) {
      shot.syncedVersion = dataVersion;
      changed = true;
    }
  }
  if (changed) {
    shots.set(holeNumber, holeShots);
    await setToDataStore(key, shots);
  }
}
