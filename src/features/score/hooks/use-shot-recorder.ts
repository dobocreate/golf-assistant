import { useReducer, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getShotsForRound, saveShotsForHole } from '@/actions/shot';
import { updateFirstPuttDistance } from '@/actions/score';
import { emptyShotForm, shotToForm, hasFormChanged, shouldSaveForm } from '@/features/score/shot-constants';
import type { Shot, ShotFormState } from '@/features/score/types';
import { distanceToCategory } from '@/features/score/types';
import { LIE_DB_TO_LABEL, SHOT_TYPE_DB_TO_LABEL } from '@/lib/golf-constants';

// --- State & Reducer ---

interface FormsState {
  cache: Map<number, Shot[]>;
  formsByHole: Map<number, Map<number, ShotFormState>>;
  adviceByHole: Map<number, Map<number, string>>;
  saveVersionByHole: Map<number, number>;
  loading: boolean;
}

/** shot-form.tsx から dispatch される型（holeNumber なし） */
export type ShotFormAction =
  | { type: 'UPDATE_FIELD'; index: number; updater: (prev: ShotFormState) => ShotFormState };

type FormsAction =
  | { type: 'INIT_ROUND'; allShots: Shot[] }
  | { type: 'UPDATE_FIELD'; holeNumber: number; index: number; updater: (prev: ShotFormState) => ShotFormState }
  | { type: 'SET_ADVICE'; holeNumber: number; index: number; text: string }
  | { type: 'UPDATE_CACHE'; holeNumber: number; shots: Shot[]; version: number }
  | { type: 'INCREMENT_SAVE_VERSION'; holeNumber: number }
  | { type: 'CLEAR_ALL' };

function groupByHole(shots: Shot[]): Map<number, Shot[]> {
  const map = new Map<number, Shot[]>();
  for (const shot of shots) {
    const arr = map.get(shot.hole_number) ?? [];
    arr.push(shot);
    map.set(shot.hole_number, arr);
  }
  return map;
}

const INITIAL_STATE: FormsState = {
  cache: new Map(),
  formsByHole: new Map(),
  adviceByHole: new Map(),
  saveVersionByHole: new Map(),
  loading: true,
};

function formsReducer(state: FormsState, action: FormsAction): FormsState {
  switch (action.type) {
    case 'INIT_ROUND':
      return { ...state, cache: groupByHole(action.allShots), loading: false };

    case 'UPDATE_FIELD': {
      const holeForms = new Map(state.formsByHole.get(action.holeNumber) ?? new Map());
      const holeShots = state.cache.get(action.holeNumber) ?? [];
      const current = holeForms.get(action.index)
        ?? (action.index < holeShots.length ? shotToForm(holeShots[action.index]) : emptyShotForm());
      holeForms.set(action.index, action.updater(current));
      const next = new Map(state.formsByHole);
      next.set(action.holeNumber, holeForms);
      return { ...state, formsByHole: next };
    }

    case 'SET_ADVICE': {
      const holeAdvice = new Map(state.adviceByHole.get(action.holeNumber) ?? new Map());
      holeAdvice.set(action.index, action.text);
      const next = new Map(state.adviceByHole);
      next.set(action.holeNumber, holeAdvice);
      return { ...state, adviceByHole: next };
    }

    case 'UPDATE_CACHE': {
      const currentVersion = state.saveVersionByHole.get(action.holeNumber) ?? 0;
      if (action.version < currentVersion) return state; // 古いレスポンスは無視
      const newCache = new Map(state.cache);
      newCache.set(action.holeNumber, action.shots);
      // 保存成功後、そのホールのformsをクリア（キャッシュが最新になったため）
      const newForms = new Map(state.formsByHole);
      newForms.delete(action.holeNumber);
      const newAdvice = new Map(state.adviceByHole);
      newAdvice.delete(action.holeNumber);
      return { ...state, cache: newCache, formsByHole: newForms, adviceByHole: newAdvice };
    }

    case 'INCREMENT_SAVE_VERSION': {
      const newVersions = new Map(state.saveVersionByHole);
      newVersions.set(action.holeNumber, (newVersions.get(action.holeNumber) ?? 0) + 1);
      return { ...state, saveVersionByHole: newVersions };
    }

    case 'CLEAR_ALL':
      return { ...state, formsByHole: new Map(), adviceByHole: new Map() };
  }
}

// --- Slot type ---

export interface ShotSlot {
  index: number;
  shotNumber: number;
  isNew: boolean;
  shot: Shot | null;
  club: string | null;
  shotTypeLabel: string | null;
  distance: number | null;
  lieLabel: string | null;
  hasAdvice: boolean;
  isSkipped: boolean;
}

// --- Hook ---

export function useShotRecorder(roundId: string, holeNumber: number) {
  const [state, dispatch] = useReducer(formsReducer, INITIAL_STATE);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveVersionRef = useRef(new Map<number, number>());
  const prevHoleRef = useRef(holeNumber);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  const roundIdRef = useRef(roundId);
  useEffect(() => { roundIdRef.current = roundId; }, [roundId]);
  const holeNumberRef = useRef(holeNumber);
  useEffect(() => { holeNumberRef.current = holeNumber; }, [holeNumber]);

  // 現在のホールのショット（キャッシュから派生）
  const shots = useMemo(() => state.cache.get(holeNumber) ?? [], [state.cache, holeNumber]);

  // --- 一括読み込み（mount時に1回だけ） ---
  useEffect(() => {
    let cancelled = false;
    getShotsForRound(roundId).then(allShots => {
      if (!cancelled) {
        dispatch({ type: 'INIT_ROUND', allShots });
      }
    }).catch(() => {
      if (!cancelled) setError('ショット記録の取得に失敗しました。');
    });
    return () => { cancelled = true; };
  }, [roundId]);

  // expandedIndex: loading完了時またはホール切替時に更新
  useEffect(() => {
    if (!state.loading) {
      setExpandedIndex(shots.length);
    }
  }, [state.loading, shots.length]);

  // --- batchSave ---
  const batchSave = useCallback(async (forHoleNumber: number, snapshot: FormsState) => {
    const payload = collectPendingShotsSync(snapshot, forHoleNumber, roundIdRef.current);
    if (payload.shots.length === 0) return;

    // バージョンをインクリメント（ref経由で一意に管理、snapshotの古さに依存しない）
    const version = (saveVersionRef.current.get(forHoleNumber) ?? 0) + 1;
    saveVersionRef.current.set(forHoleNumber, version);
    dispatch({ type: 'INCREMENT_SAVE_VERSION', holeNumber: forHoleNumber });

    setSaveStatus('saving');
    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);

    const result = await saveShotsForHole(payload);
    if (result.error) {
      setSaveStatus('error');
    } else {
      setSaveStatus('saved');
      saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000);

      // キャッシュ更新（サーバー発行IDを反映）
      if (result.shots) {
        dispatch({ type: 'UPDATE_CACHE', holeNumber: forHoleNumber, shots: result.shots, version });
      }

      // パット距離同期
      const holeForms = snapshot.formsByHole.get(forHoleNumber);
      if (holeForms) {
        for (const [, form] of holeForms) {
          if (form.shotType === 'putt' && (form.puttDistanceMeters != null || form.puttDistanceCategory)) {
            const meters = form.puttDistanceMeters;
            const category = meters != null ? distanceToCategory(meters) : form.puttDistanceCategory;
            updateFirstPuttDistance({
              roundId: payload.roundId,
              holeNumber: forHoleNumber,
              firstPuttDistance: category,
              firstPuttDistanceM: meters,
            }).catch(() => {});
            break;
          }
        }
      }
    }
  }, []);

  // --- ホール切替: 前ホール保存のみ（読込はキャッシュから自動） ---
  // batchSave は useCallback([], []) で安定しているため直接参照可能
  useEffect(() => {
    if (prevHoleRef.current !== holeNumber) {
      const prevHole = prevHoleRef.current;
      prevHoleRef.current = holeNumber;
      batchSave(prevHole, stateRef.current);
    }
  }, [holeNumber, batchSave]);

  // --- アンマウント時: 現在のホールの未保存データを fire-and-forget で保存 ---
  useEffect(() => {
    return () => {
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
      const snapshot = stateRef.current;
      const hole = holeNumberRef.current;
      const rid = roundIdRef.current;
      const payload = collectPendingShotsSync(snapshot, hole, rid);
      if (payload.shots.length > 0) {
        saveShotsForHole(payload).catch(() => {});
      }
    };
  }, []);

  // --- 新規スロット表示管理 ---
  const [showNewSlot, setShowNewSlot] = useState(false);
  // ホール切替時に新規スロットを非表示にリセット
  useEffect(() => {
    setShowNewSlot(false);
  }, [holeNumber]);

  // --- スロット一覧 ---
  const nextShotNumber = shots.length > 0
    ? Math.max(...shots.map(s => s.shot_number)) + 1
    : 1;

  const holeForms = state.formsByHole.get(holeNumber);

  const allSlots: ShotSlot[] = [
    ...shots.map((shot, i) => ({
      index: i,
      shotNumber: shot.shot_number,
      isNew: false,
      shot,
      club: shot.club,
      shotTypeLabel: shot.shot_type ? (SHOT_TYPE_DB_TO_LABEL[shot.shot_type] ?? null) : null,
      distance: shot.remaining_distance,
      lieLabel: shot.lie ? (LIE_DB_TO_LABEL[shot.lie] ?? null) : null,
      hasAdvice: !!shot.advice_text,
      isSkipped: shot.result === null && shot.club === null && shot.shot_type === null,
    })),
    ...(showNewSlot ? [{
      index: shots.length,
      shotNumber: nextShotNumber,
      isNew: true,
      shot: null,
      club: null,
      shotTypeLabel: null,
      distance: null,
      lieLabel: null,
      hasAdvice: false,
      isSkipped: false,
    }] : []),
  ];

  const displaySlots = [...allSlots].reverse();

  const getForm = useCallback((index: number): ShotFormState => {
    return holeForms?.get(index)
      ?? (index < shots.length ? shotToForm(shots[index]) : emptyShotForm());
  }, [holeForms, shots]);

  const handleAdviceReceived = useCallback((index: number, text: string) => {
    dispatch({ type: 'SET_ADVICE', holeNumber: holeNumberRef.current, index, text });
  }, []);

  const handleAddShot = useCallback(() => {
    setShowNewSlot(true);
    setExpandedIndex(shots.length);
  }, [shots.length]);

  // dispatch ラッパー: shot-form からの action に holeNumber を自動付与
  const dispatchWithHole = useCallback((action: ShotFormAction) => {
    if (action.type === 'UPDATE_FIELD') {
      dispatch({ ...action, holeNumber: holeNumberRef.current });
    }
  }, []);

  /** 現在のホールのショットを明示的に保存（保存ボタンから呼ばれる） */
  const saveCurrentHole = useCallback(() => {
    batchSave(holeNumberRef.current, stateRef.current);
  }, [batchSave]);

  /** 現在のホールに未保存の変更があるか（呼び出し時に計算） */
  const hasPendingShots = useCallback(() => {
    const payload = collectPendingShotsSync(stateRef.current, holeNumberRef.current, roundIdRef.current);
    return payload.shots.length > 0;
  }, []);

  return {
    displaySlots,
    expandedIndex,
    setExpandedIndex,
    getForm,
    dispatch: dispatchWithHole,
    error,
    saveStatus,
    handleAdviceReceived,
    handleAddShot,
    shots,
    loading: state.loading,
    saveCurrentHole,
    hasPendingShots,
  };
}

// --- collectPendingShotsSync ---

function collectPendingShotsSync(
  state: FormsState,
  forHoleNumber: number,
  roundId: string,
) {
  const holeShots = state.cache.get(forHoleNumber) ?? [];
  const holeForms = state.formsByHole.get(forHoleNumber) ?? new Map<number, ShotFormState>();
  const holeAdvice = state.adviceByHole.get(forHoleNumber) ?? new Map<number, string>();

  const pending: Array<{
    id?: string;
    shotNumber: number;
    club: string | null;
    result: string | null;
    missType: string | null;
    directionLr: string | null;
    directionFb: string | null;
    lie: string | null;
    slopeFb: string | null;
    slopeLr: string | null;
    landing: string | null;
    shotType: string | null;
    remainingDistance: number | null;
    note: string | null;
    adviceText: string | null;
    windDirection: string | null;
    windStrength: string | null;
    elevation: string | null;
  }> = [];

  // 既存ショットで変更があるもの
  for (let i = 0; i < holeShots.length; i++) {
    const form = holeForms.get(i);
    const advice = holeAdvice.get(i);
    const shot = holeShots[i];
    const adviceChanged = advice !== undefined && advice !== (shot.advice_text ?? null);
    if (form && (hasFormChanged(form, shot) || adviceChanged)) {
      pending.push({
        id: shot.id,
        shotNumber: shot.shot_number,
        ...formToPayload(form),
        adviceText: advice ?? shot.advice_text,
      });
    }
  }

  // 新規スロット
  const formKeys = Array.from(holeForms.keys()).filter(k => k >= holeShots.length).sort((a, b) => a - b);
  for (const i of formKeys) {
    const form = holeForms.get(i)!;
    if (!shouldSaveForm(form)) continue;
    const nextShotNum = holeShots.length > 0
      ? Math.max(...holeShots.map(s => s.shot_number)) + 1 + (i - holeShots.length)
      : i + 1;
    pending.push({
      shotNumber: nextShotNum,
      ...formToPayload(form),
      adviceText: holeAdvice.get(i) ?? null,
    });
  }

  return { roundId, holeNumber: forHoleNumber, shots: pending };
}

function formToPayload(form: ShotFormState) {
  const showMiss = form.result === 'fair' || form.result === 'poor';
  return {
    club: form.club,
    result: form.result,
    missType: showMiss ? form.missType : null,
    directionLr: form.directionLr,
    directionFb: form.directionFb,
    lie: form.lie,
    slopeFb: form.slopeFb,
    slopeLr: form.slopeLr,
    landing: form.landing,
    shotType: form.shotType,
    remainingDistance: form.remainingDistance,
    note: form.note,
    windDirection: form.windDirection,
    windStrength: form.windStrength,
    elevation: form.elevation,
  };
}
