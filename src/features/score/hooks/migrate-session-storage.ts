'use client';

import {
  getFromDataStore,
  setToDataStore,
  type LocalScore,
  type LocalShot,
} from '@/lib/offline-store';
import {
  getSession,
  roundScoresKey,
  roundShotsKey,
  roundCompanionKey,
  removeSession,
} from '@/lib/session-storage';
import type { Score, Shot } from '@/features/score/types';
import type { HoleInputs } from './use-offline-store';

/**
 * Migrate data from sessionStorage to IndexedDB for a given round.
 *
 * This is a one-time migration that runs on first access after the
 * offline-first architecture is deployed. It compares sessionStorage
 * data with server data to determine which is newer, and writes the
 * appropriate values into IndexedDB with correct version/syncedVersion.
 *
 * After successful migration, sessionStorage keys for this round are removed.
 */
export async function migrateFromSessionStorage(
  roundId: string,
  serverScores: Score[],
): Promise<void> {
  // Each data type is migrated independently (scores being done doesn't skip shots/companions)
  let migrated = false;

  // --- Migrate scores ---
  const existingScores = await getFromDataStore<Map<number, LocalScore>>(
    `scores:${roundId}`,
  );
  const sessionScores = getSession<Map<number, Score>>(roundScoresKey(roundId));
  if (!existingScores && sessionScores && sessionScores.size > 0) {
    const serverScoreMap = new Map<number, Score>();
    for (const s of serverScores) {
      serverScoreMap.set(s.hole_number, s);
    }

    const localScores = new Map<number, LocalScore>();

    for (const [holeNumber, sessionScore] of sessionScores) {
      const serverScore = serverScoreMap.get(holeNumber);

      if (serverScore) {
        // Both exist: compare to determine which is newer
        // If sessionStorage differs from server, sessionStorage is likely newer
        // (user made changes that haven't been persisted to DB)
        const isDifferent = hasScoreDifference(sessionScore, serverScore);

        if (isDifferent) {
          // Session has newer data - mark as unsynced (version > syncedVersion)
          localScores.set(holeNumber, {
            ...sessionScore,
            version: 1,
            syncedVersion: 0,
          });
        } else {
          // Same data - mark as synced
          localScores.set(holeNumber, {
            ...serverScore,
            version: 1,
            syncedVersion: 1,
          });
        }
      } else {
        // Only in sessionStorage - new data, unsynced
        localScores.set(holeNumber, {
          ...sessionScore,
          version: 1,
          syncedVersion: 0,
        });
      }
    }

    // Also include server-only scores (not in sessionStorage)
    for (const serverScore of serverScores) {
      if (!localScores.has(serverScore.hole_number)) {
        localScores.set(serverScore.hole_number, {
          ...serverScore,
          version: 1,
          syncedVersion: 1,
        });
      }
    }

    if (localScores.size > 0) {
      await setToDataStore(`scores:${roundId}`, localScores);
      migrated = true;
    }
  } else if (serverScores.length > 0) {
    // No sessionStorage data - seed IndexedDB from server data
    const localScores = new Map<number, LocalScore>();
    for (const s of serverScores) {
      localScores.set(s.hole_number, {
        ...s,
        version: 1,
        syncedVersion: 1,
      });
    }
    await setToDataStore(`scores:${roundId}`, localScores);
    migrated = true;
  }

  // --- Migrate shots (independent check) ---
  const existingShots = await getFromDataStore<Map<number, LocalShot[]>>(
    `shots:${roundId}`,
  );
  const sessionShots = getSession<Map<number, Shot[]>>(roundShotsKey(roundId));
  if (!existingShots && sessionShots && sessionShots.size > 0) {
    const localShots = new Map<number, LocalShot[]>();

    for (const [holeNumber, shots] of sessionShots) {
      const localHoleShots: LocalShot[] = shots.map((shot) => ({
        ...shot,
        clientId: shot.id || crypto.randomUUID(),
        version: 1,
        syncedVersion: shot.id ? 1 : 0, // If it has an ID, it was saved to DB
      }));
      localShots.set(holeNumber, localHoleShots);
    }

    if (localShots.size > 0) {
      await setToDataStore(`shots:${roundId}`, localShots);
      migrated = true;
    }
  }

  // --- Migrate companion data (independent check) ---
  const existingCompanions = await getFromDataStore<Map<number, HoleInputs>>(
    `companions:${roundId}`,
  );
  const sessionCompanions = getSession<Map<number, HoleInputs>>(
    roundCompanionKey(roundId),
  );
  if (!existingCompanions && sessionCompanions && sessionCompanions.size > 0) {
    await setToDataStore(`companions:${roundId}`, sessionCompanions);
    migrated = true;
  }

  // --- Clean up sessionStorage after successful migration ---
  if (migrated) {
    removeSession(roundScoresKey(roundId));
    removeSession(roundShotsKey(roundId));
    removeSession(roundCompanionKey(roundId));
    removeSession(`golf-dirty-${roundId}`);
  }
}

// --- Helpers ---

/** Compare two score objects to detect meaningful differences */
function hasScoreDifference(a: Score, b: Score): boolean {
  return (
    a.strokes !== b.strokes ||
    a.putts !== b.putts ||
    a.fairway_hit !== b.fairway_hit ||
    a.green_in_reg !== b.green_in_reg ||
    a.tee_shot_lr !== b.tee_shot_lr ||
    a.tee_shot_fb !== b.tee_shot_fb ||
    a.ob_count !== b.ob_count ||
    a.bunker_count !== b.bunker_count ||
    a.penalty_count !== b.penalty_count ||
    a.first_putt_distance !== b.first_putt_distance ||
    a.first_putt_distance_m !== b.first_putt_distance_m ||
    a.wind_direction !== b.wind_direction ||
    a.wind_strength !== b.wind_strength
  );
}
