'use client';

import { useState, useEffect, useRef } from 'react';
import { useOfflineStore } from './use-offline-store';
import { migrateFromSessionStorage } from './migrate-session-storage';
import { syncQueue } from '@/lib/sync-queue';
import type { LocalScore } from '@/lib/offline-store';
import type { Score } from '@/features/score/types';

export type RecoveryState = 'checking' | 'merging' | 'ready' | 'error';

/**
 * Recovery hook: handles app recovery when user returns after crash/tab kill.
 *
 * On mount:
 * 1. Run sessionStorage migration (one-time, no-op if already migrated)
 * 2. Check IndexedDB for unsynced data
 * 3. If unsynced: load local, merge with server, save back, queue unsynced
 * 4. If no unsynced: seed IndexedDB from server data
 * 5. Set state to 'ready'
 */
export function useRecovery(roundId: string, serverScores: Score[]) {
  const offlineStore = useOfflineStore(roundId);
  const [recoveryState, setRecoveryState] = useState<RecoveryState>('checking');
  const [mergedScores, setMergedScores] = useState<Map<number, LocalScore> | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        // Step 1: sessionStorage migration (safe no-op if already done)
        await migrateFromSessionStorage(roundId, serverScores);

        // Step 2: check for unsynced data
        const hasUnsynced = await offlineStore.hasUnsyncedData();

        if (hasUnsynced) {
          if (!cancelled) setRecoveryState('merging');

          // Step 3a: load local scores
          const localScores = await offlineStore.loadScoresLocal();

          // Step 3b: merge with server
          const merged = mergeScores(
            localScores ?? new Map<number, LocalScore>(),
            serverScores,
          );

          // Step 3c: save merged result back to IndexedDB
          await offlineStore.saveScoresLocal(merged);

          // Step 3d: queue unsynced items for DB sync
          for (const [holeNumber, localScore] of merged) {
            if (localScore.version > localScore.syncedVersion) {
              await syncQueue.enqueueOrReplace({
                action: 'replaceScoreForHole',
                payload: {
                  roundId,
                  holeNumber,
                  strokes: localScore.strokes,
                  putts: localScore.putts,
                  fairwayHit: localScore.fairway_hit,
                  greenInReg: localScore.green_in_reg,
                  teeShotLr: localScore.tee_shot_lr,
                  teeShotFb: localScore.tee_shot_fb,
                  obCount: localScore.ob_count,
                  bunkerCount: localScore.bunker_count,
                  penaltyCount: localScore.penalty_count,
                  firstPuttDistance: localScore.first_putt_distance,
                  firstPuttDistanceM: localScore.first_putt_distance_m,
                  windDirection: localScore.wind_direction,
                  windStrength: localScore.wind_strength,
                },
                roundId,
                holeNumber,
                dataVersion: localScore.version,
                maxRetries: 5,
              });
            }
          }

          // Step 3e: also enqueue unsynced shots for DB sync
          const localShots = await offlineStore.loadShotsLocal();
          if (localShots) {
            for (const [holeNumber, shots] of localShots) {
              const hasUnsynced = shots.some(s => s.version > s.syncedVersion);
              if (hasUnsynced) {
                await syncQueue.enqueueOrReplace({
                  action: 'replaceShotsForHole',
                  payload: {
                    roundId,
                    holeNumber,
                    shots: shots.map(s => ({
                      clientId: s.clientId,
                      shotNumber: s.shot_number,
                      club: s.club,
                      result: s.result,
                      missType: s.miss_type,
                      directionLr: s.direction_lr,
                      directionFb: s.direction_fb,
                      lie: s.lie,
                      slopeFb: s.slope_fb,
                      slopeLr: s.slope_lr,
                      landing: s.landing,
                      shotType: s.shot_type,
                      remainingDistance: s.remaining_distance,
                      note: s.note,
                      adviceText: s.advice_text,
                      windDirection: s.wind_direction,
                      windStrength: s.wind_strength,
                      elevation: s.elevation,
                    })),
                  },
                  roundId,
                  holeNumber,
                  dataVersion: Math.max(...shots.map(s => s.version)),
                  maxRetries: 5,
                });
              }
            }
          }

          if (!cancelled) {
            setMergedScores(merged);
            setRecoveryState('ready');
          }
        } else {
          // Step 4: no unsynced data - seed IndexedDB from server
          const seeded = new Map<number, LocalScore>();
          for (const s of serverScores) {
            seeded.set(s.hole_number, toLocalScore(s, 1, 1));
          }
          if (seeded.size > 0) {
            await offlineStore.saveScoresLocal(seeded);
          }

          if (!cancelled) {
            setMergedScores(seeded);
            setRecoveryState('ready');
          }
        }
      } catch (err) {
        console.error('[useRecovery] Recovery failed:', err);
        if (!cancelled) setRecoveryState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
    // offlineStore is stable (useCallback-based), serverScores from server component
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  return {
    recoveryState,
    mergedScores,
  };
}

// --- Helpers ---

/** Convert a server Score to a LocalScore with version tracking */
function toLocalScore(
  score: Score,
  version: number,
  syncedVersion: number,
): LocalScore {
  return {
    ...score,
    version,
    syncedVersion,
  };
}

/**
 * Merge local IndexedDB scores with server scores using version-based strategy.
 *
 * - local.version > local.syncedVersion -> local wins (unsynced changes)
 * - local.version === local.syncedVersion -> server wins (already synced)
 * - no local data for a hole -> use server data
 * - no server data for a hole -> keep local (mark unsynced)
 */
function mergeScores(
  local: Map<number, LocalScore>,
  serverScores: Score[],
): Map<number, LocalScore> {
  const merged = new Map<number, LocalScore>();
  const serverMap = new Map(serverScores.map((s) => [s.hole_number, s]));

  // Collect all hole numbers from both sources
  const allHoles = new Set([...local.keys(), ...serverMap.keys()]);

  for (const hole of allHoles) {
    const localScore = local.get(hole);
    const serverScore = serverMap.get(hole);

    if (!localScore && serverScore) {
      // Only on server - use server, mark as synced
      merged.set(hole, toLocalScore(serverScore, 1, 1));
    } else if (localScore && !serverScore) {
      // Only local - keep local, mark as unsynced
      merged.set(hole, { ...localScore, syncedVersion: 0 });
    } else if (localScore && serverScore) {
      if (localScore.version > localScore.syncedVersion) {
        // Local has unsynced changes - local wins
        merged.set(hole, localScore);
      } else {
        // Local is synced - server wins (may have newer data from another device)
        merged.set(hole, toLocalScore(serverScore, localScore.version, localScore.version));
      }
    }
  }

  return merged;
}

/** Convert a LocalScore map back to Score[] for ScoreInput compatibility */
export function localScoresToScores(
  localScores: Map<number, LocalScore>,
): Score[] {
  const scores: Score[] = [];
  for (const localScore of localScores.values()) {
    // Strip version fields to get a plain Score
    const { version: _v, syncedVersion: _sv, ...score } = localScore;
    scores.push(score);
  }
  return scores.sort((a, b) => a.hole_number - b.hole_number);
}
