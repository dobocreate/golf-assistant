'use client';

import { useState, useEffect, useRef } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreInput } from '@/features/score/components/score-input';
import { useOfflineStore } from '@/features/score/hooks/use-offline-store';
import { useRecovery, localScoresToScores } from '@/features/score/hooks/use-recovery';
import type { Weather } from '@/features/round/types';
import type { Score, HoleInfo, Companion, CompanionScore } from '@/features/score/types';
import type { GamePlan } from '@/features/game-plan/types';

/** Server-fetched data bundle passed from the page Server Component */
export interface ServerData {
  roundId: string;
  holes: HoleInfo[];
  initialScores: Score[];
  courseName: string;
  clubs: { name: string }[];
  editMode: boolean;
  startingCourse: 'out' | 'in';
  initialHole: number | undefined;
  weather: string | null;
  gamePlans: GamePlan[];
  targetScore: number | null;
  scoreLevel: string | null;
  handicap: number | null;
  companions: Companion[];
  initialCompanionScores: CompanionScore[];
}

interface ScoreClientShellProps {
  serverData: ServerData | null;
  roundId: string;
}

type ShellState =
  | { status: 'loading' }
  | { status: 'recovering'; data: ServerData }
  | { status: 'ready'; data: ServerData; isOfflineMode: boolean }
  | { status: 'no-data' };

export function ScoreClientShell({ serverData, roundId }: ScoreClientShellProps) {
  const [state, setState] = useState<ShellState>(
    serverData
      ? { status: 'recovering', data: serverData }
      : { status: 'loading' },
  );
  const offlineStore = useOfflineStore(roundId);
  const cachedRef = useRef(false);

  // When serverData exists, cache read data to IndexedDB
  useEffect(() => {
    if (!serverData || cachedRef.current) return;
    cachedRef.current = true;

    const { holes, gamePlans, clubs, courseName, startingCourse, weather, targetScore } = serverData;
    offlineStore.cacheReadData({
      holes,
      gamePlans,
      clubs: clubs.map(c => ({ name: c.name })),
      roundMeta: {
        courseName,
        startingCourse,
        weather: weather as Weather | null,
        wind: null,
        targetScore,
      },
    });
  }, [serverData, offlineStore]);

  // When serverData is null (offline), try to load from IndexedDB
  useEffect(() => {
    if (serverData !== null) return;

    let cancelled = false;

    async function loadFromIndexedDB() {
      try {
        const cached = await offlineStore.loadReadData();
        if (cancelled) return;

        if (!cached) {
          setState({ status: 'no-data' });
          return;
        }

        // Build ServerData from cached read data + write data (scores from IndexedDB)
        const localScores = await offlineStore.loadScoresLocal();

        // Convert LocalScore Map to Score[] for ScoreInput
        const initialScores: Score[] = [];
        if (localScores) {
          for (const [, ls] of localScores) {
            // Strip version/syncedVersion fields for Score compatibility
            const { version: _v, syncedVersion: _sv, ...score } = ls as Score & { version: number; syncedVersion: number };
            initialScores.push(score);
          }
        }
        // NOTE: Shots and companion scores are restored by the orchestrator
        // via IndexedDB when ScoreInput mounts. They don't need to be passed
        // through ServerData props.

        const offlineData: ServerData = {
          roundId,
          holes: cached.holes,
          initialScores,
          courseName: cached.roundMeta.courseName,
          clubs: cached.clubs.map(c => ({ name: c.name })),
          editMode: false,
          startingCourse: cached.roundMeta.startingCourse,
          initialHole: undefined,
          weather: cached.roundMeta.weather,
          gamePlans: cached.gamePlans,
          targetScore: cached.roundMeta.targetScore,
          scoreLevel: null,
          handicap: null,
          companions: [],
          initialCompanionScores: [],
        };

        setState({ status: 'ready', data: offlineData, isOfflineMode: true });
      } catch {
        if (!cancelled) {
          setState({ status: 'no-data' });
        }
      }
    }

    loadFromIndexedDB();
    return () => { cancelled = true; };
  }, [serverData, roundId, offlineStore]);

  // Loading: show skeleton (same layout as loading.tsx)
  if (state.status === 'loading') {
    return <ScoreLoadingSkeleton />;
  }

  // No data available from server or IndexedDB
  if (state.status === 'no-data') {
    return (
      <div className="max-w-md mx-auto flex flex-col items-center justify-center gap-4 py-16">
        <p className="text-zinc-400 text-center">
          データが見つかりません。<br />
          ネットワーク接続を確認してページを再読み込みしてください。
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
        >
          再読み込み
        </button>
      </div>
    );
  }

  // Recovering: run recovery then render ScoreInput
  if (state.status === 'recovering') {
    return (
      <RecoveryGate
        serverData={state.data}
        roundId={roundId}
        onReady={(data) => setState({ status: 'ready', data, isOfflineMode: false })}
      />
    );
  }

  // Ready: render ScoreInput
  const { data } = state;
  return (
    <ScoreInput
      roundId={data.roundId}
      holes={data.holes}
      initialScores={data.initialScores}
      courseName={data.courseName}
      clubs={data.clubs}
      editMode={data.editMode}
      startingCourse={data.startingCourse}
      initialHole={data.initialHole}
      weather={data.weather}
      gamePlans={data.gamePlans}
      targetScore={data.targetScore}
      scoreLevel={data.scoreLevel}
      handicap={data.handicap}
      companions={data.companions}
      initialCompanionScores={data.initialCompanionScores}
    />
  );
}

/** Runs recovery and transitions to ready state with merged scores */
function RecoveryGate({
  serverData,
  roundId,
  onReady,
}: {
  serverData: ServerData;
  roundId: string;
  onReady: (data: ServerData) => void;
}) {
  const { recoveryState, mergedScores } = useRecovery(roundId, serverData.initialScores);

  useEffect(() => {
    if (recoveryState === 'ready' && mergedScores) {
      const recoveredScores = localScoresToScores(mergedScores);
      onReady({
        ...serverData,
        initialScores: recoveredScores,
      });
    } else if (recoveryState === 'error') {
      // On error, fall back to server data as-is
      onReady(serverData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recoveryState, mergedScores]);

  return (
    <div className="max-w-md mx-auto flex flex-col items-center justify-center gap-4 py-16">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      <p className="text-zinc-400 text-sm">
        データを復元中...
      </p>
    </div>
  );
}

/** Skeleton matching the score input layout (reuses loading.tsx pattern) */
function ScoreLoadingSkeleton() {
  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-12 w-12 rounded-lg" />
        <div className="text-center space-y-1">
          <Skeleton className="h-8 w-24 mx-auto" />
          <Skeleton className="h-5 w-20 mx-auto" />
        </div>
        <Skeleton className="h-12 w-12 rounded-lg" />
      </div>
      <Skeleton className="h-16 w-full rounded-lg" />
      <div className="space-y-1">
        <Skeleton className="h-4 w-12 mx-auto" />
        <div className="flex items-center justify-center gap-3">
          <Skeleton className="h-14 w-14 rounded-lg" />
          <Skeleton className="h-10 w-12" />
          <Skeleton className="h-14 w-14 rounded-lg" />
        </div>
      </div>
      <div className="space-y-1">
        <Skeleton className="h-4 w-10 mx-auto" />
        <div className="flex items-center justify-center gap-3">
          <Skeleton className="h-14 w-14 rounded-lg" />
          <Skeleton className="h-10 w-12" />
          <Skeleton className="h-14 w-14 rounded-lg" />
        </div>
      </div>
      <Skeleton className="h-12 w-full rounded-lg" />
    </div>
  );
}
