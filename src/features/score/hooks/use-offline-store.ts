'use client';

import { useCallback } from 'react';
import {
  getFromDataStore,
  setToDataStore,
  delFromDataStore,
  type LocalScore,
  type LocalShot,
} from '@/lib/offline-store';
import type { HoleInfo } from '@/features/score/types';
import type { GamePlan } from '@/features/game-plan/types';
import type { StartingCourse, Weather, WindStrength } from '@/features/round/types';
import type { HoleMapPoint, HoleElevationGrid } from '@/lib/geo';

// --- Companion HoleInputs (matches companion-score-editor.tsx) ---

/** Per-companion inputs for a single hole */
export type CompanionHoleInput = { strokes: string; putts: string };

/** Map<companionId, CompanionHoleInput> for one hole */
export type HoleInputs = Map<string, CompanionHoleInput>;

// --- RoundMeta (read-only cache of round-level info) ---

export interface RoundMeta {
  courseName: string;
  startingCourse: StartingCourse;
  weather: Weather | null;
  wind: WindStrength | null;
  targetScore: number | null;
}

// --- Read data bundle ---

/** Minimal club info needed for offline display */
export interface CachedClub {
  name: string;
}

export interface ReadDataCache {
  holes: HoleInfo[];
  gamePlans: GamePlan[];
  clubs: CachedClub[];
  roundMeta: RoundMeta;
}

// --- Hook ---

export function useOfflineStore(roundId: string) {
  // === Write data keys ===
  const scoresKey = `scores:${roundId}` as const;
  const shotsKey = `shots:${roundId}` as const;
  const companionsKey = `companions:${roundId}` as const;

  // === Read data keys ===
  const holesKey = `holes:${roundId}` as const;
  const gamePlansKey = `gamePlans:${roundId}` as const;
  const clubsKey = `clubs:${roundId}` as const;
  const roundMetaKey = `roundMeta:${roundId}` as const;

  // === Meta key ===
  const metaKey = `meta:${roundId}` as const;

  // --- Write data ---

  const saveScoresLocal = useCallback(
    async (scores: Map<number, LocalScore>): Promise<void> => {
      await setToDataStore(scoresKey, scores);
    },
    [scoresKey],
  );

  const loadScoresLocal = useCallback(
    async (): Promise<Map<number, LocalScore> | undefined> => {
      return getFromDataStore<Map<number, LocalScore>>(scoresKey);
    },
    [scoresKey],
  );

  const saveShotsLocal = useCallback(
    async (shots: Map<number, LocalShot[]>): Promise<void> => {
      await setToDataStore(shotsKey, shots);
    },
    [shotsKey],
  );

  const loadShotsLocal = useCallback(
    async (): Promise<Map<number, LocalShot[]> | undefined> => {
      return getFromDataStore<Map<number, LocalShot[]>>(shotsKey);
    },
    [shotsKey],
  );

  const saveCompanionsLocal = useCallback(
    async (data: Map<number, HoleInputs>): Promise<void> => {
      await setToDataStore(companionsKey, data);
    },
    [companionsKey],
  );

  const loadCompanionsLocal = useCallback(
    async (): Promise<Map<number, HoleInputs> | undefined> => {
      return getFromDataStore<Map<number, HoleInputs>>(companionsKey);
    },
    [companionsKey],
  );

  // --- Read data cache ---

  const cacheReadData = useCallback(
    async (data: ReadDataCache): Promise<void> => {
      await Promise.all([
        setToDataStore(holesKey, data.holes),
        setToDataStore(gamePlansKey, data.gamePlans),
        setToDataStore(clubsKey, data.clubs),
        setToDataStore(roundMetaKey, data.roundMeta),
      ]);
    },
    [holesKey, gamePlansKey, clubsKey, roundMetaKey],
  );

  const loadReadData = useCallback(
    async (): Promise<ReadDataCache | undefined> => {
      const [holes, gamePlans, clubs, roundMeta] = await Promise.all([
        getFromDataStore<HoleInfo[]>(holesKey),
        getFromDataStore<GamePlan[]>(gamePlansKey),
        getFromDataStore<CachedClub[]>(clubsKey),
        getFromDataStore<RoundMeta>(roundMetaKey),
      ]);

      if (!holes || !gamePlans || !clubs || !roundMeta) return undefined;
      return { holes, gamePlans, clubs, roundMeta };
    },
    [holesKey, gamePlansKey, clubsKey, roundMetaKey],
  );

  // --- Map data cache (keyed by courseId, not roundId) ---

  const cacheMapPoints = useCallback(
    async (courseId: string, points: HoleMapPoint[]): Promise<void> => {
      await setToDataStore(`mapPoints:${courseId}`, points);
    },
    [],
  );

  const getCachedMapPoints = useCallback(
    async (courseId: string): Promise<HoleMapPoint[] | null> => {
      const data = await getFromDataStore<HoleMapPoint[]>(`mapPoints:${courseId}`);
      return data ?? null;
    },
    [],
  );

  const cacheElevationGrids = useCallback(
    async (courseId: string, grids: HoleElevationGrid[]): Promise<void> => {
      await setToDataStore(`elevGrids:${courseId}`, grids);
    },
    [],
  );

  const getCachedElevationGrids = useCallback(
    async (courseId: string): Promise<HoleElevationGrid[] | null> => {
      const data = await getFromDataStore<HoleElevationGrid[]>(`elevGrids:${courseId}`);
      return data ?? null;
    },
    [],
  );

  // --- Unsynced check ---

  const hasUnsyncedData = useCallback(async (): Promise<boolean> => {
    const [scores, shots] = await Promise.all([
      getFromDataStore<Map<number, LocalScore>>(scoresKey),
      getFromDataStore<Map<number, LocalShot[]>>(shotsKey),
    ]);

    if (scores) {
      for (const localScore of scores.values()) {
        if (localScore.version > localScore.syncedVersion) return true;
      }
    }

    if (shots) {
      for (const holeShots of shots.values()) {
        for (const shot of holeShots) {
          if (shot.version > shot.syncedVersion) return true;
        }
      }
    }

    return false;
  }, [scoresKey, shotsKey]);

  // --- Cleanup ---

  const clearRoundData = useCallback(async (): Promise<void> => {
    await Promise.all([
      delFromDataStore(scoresKey),
      delFromDataStore(shotsKey),
      delFromDataStore(companionsKey),
      delFromDataStore(holesKey),
      delFromDataStore(gamePlansKey),
      delFromDataStore(clubsKey),
      delFromDataStore(roundMetaKey),
      delFromDataStore(metaKey),
    ]);
  }, [scoresKey, shotsKey, companionsKey, holesKey, gamePlansKey, clubsKey, roundMetaKey, metaKey]);

  return {
    saveScoresLocal,
    loadScoresLocal,
    saveShotsLocal,
    loadShotsLocal,
    saveCompanionsLocal,
    loadCompanionsLocal,
    cacheReadData,
    loadReadData,
    cacheMapPoints,
    getCachedMapPoints,
    cacheElevationGrids,
    getCachedElevationGrids,
    hasUnsyncedData,
    clearRoundData,
  };
}
