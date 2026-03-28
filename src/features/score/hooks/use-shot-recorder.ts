import { useReducer, useState, useEffect, useCallback, useRef } from 'react';
import { getShots, saveShotsForHole } from '@/actions/shot';
import { updateFirstPuttDistance } from '@/actions/score';
import { emptyShotForm, shotToForm, hasFormChanged, shouldSaveForm } from '@/features/score/shot-constants';
import type { Shot, ShotFormState } from '@/features/score/types';
import { distanceToCategory } from '@/features/score/types';
import { LIE_DB_TO_LABEL, SHOT_TYPE_DB_TO_LABEL } from '@/lib/golf-constants';

// --- Reducer ---

export type FormsAction =
  | { type: 'INIT'; shots: Shot[] }
  | { type: 'UPDATE_FIELD'; index: number; updater: (prev: ShotFormState) => ShotFormState }
  | { type: 'CLEAR_ALL' };

interface FormsState {
  forms: Map<number, ShotFormState>;
  shots: Shot[];
}

function formsReducer(state: FormsState, action: FormsAction): FormsState {
  switch (action.type) {
    case 'INIT':
      return { forms: new Map(), shots: action.shots };
    case 'UPDATE_FIELD': {
      const next = new Map(state.forms);
      const current = state.forms.get(action.index)
        ?? (action.index < state.shots.length ? shotToForm(state.shots[action.index]) : emptyShotForm());
      next.set(action.index, action.updater(current));
      return { ...state, forms: next };
    }
    case 'CLEAR_ALL':
      return { forms: new Map(), shots: state.shots };
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
  const [state, dispatch] = useReducer(formsReducer, { forms: new Map(), shots: [] });
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [adviceMap, setAdviceMap] = useState<Map<number, string>>(new Map());

  const { shots } = state;
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ホール変更時の自動保存 + データ取得
  const prevHoleRef = useRef(holeNumber);
  const stateRef = useRef(state);
  const adviceMapRef = useRef(adviceMap);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { adviceMapRef.current = adviceMap; }, [adviceMap]);

  // アンマウント時にタイマークリーンアップ + 未保存データの保存
  const holeNumberRef = useRef(holeNumber);
  useEffect(() => { holeNumberRef.current = holeNumber; }, [holeNumber]);
  const roundIdRef = useRef(roundId);
  useEffect(() => { roundIdRef.current = roundId; }, [roundId]);

  useEffect(() => {
    return () => {
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
      // アンマウント時: 現在のホールの未保存データを fire-and-forget で保存
      const snapshot = stateRef.current;
      const adviceSnapshot = adviceMapRef.current;
      const hole = holeNumberRef.current;
      const rid = roundIdRef.current;
      const payload = collectPendingShotsSync(snapshot, adviceSnapshot, rid, hole);
      if (payload.shots.length > 0) {
        saveShotsForHole(payload).catch(() => {});
      }
    };
  }, []);

  const collectPendingShots = useCallback((
    snapshotState: FormsState,
    snapshotAdvice: Map<number, string>,
    forHoleNumber: number,
  ) => {
    return collectPendingShotsSync(snapshotState, snapshotAdvice, roundId, forHoleNumber);
  }, [roundId]);

  const batchSave = useCallback(async (forHoleNumber: number, snapshotState: FormsState, snapshotAdvice: Map<number, string>) => {
    const payload = collectPendingShots(snapshotState, snapshotAdvice, forHoleNumber);
    if (payload.shots.length === 0) return;

    setSaveStatus('saving');
    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);

    const result = await saveShotsForHole(payload);
    if (result.error) {
      setSaveStatus('error');
    } else {
      setSaveStatus('saved');
      saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000);

      // パットショットのパット距離をscoresテーブルに同期
      const allForms = snapshotState.forms;
      for (const [, form] of allForms) {
        if (form.shotType === 'putt' && (form.puttDistanceMeters != null || form.puttDistanceCategory)) {
          const meters = form.puttDistanceMeters;
          const category = meters != null ? distanceToCategory(meters) : form.puttDistanceCategory;
          updateFirstPuttDistance({
            roundId: payload.roundId,
            holeNumber: forHoleNumber,
            firstPuttDistance: category,
            firstPuttDistanceM: meters,
          }).catch(() => {});
          break; // ファーストパットのみ同期
        }
      }
    }
  }, [collectPendingShots]);

  // ホール変更検知: 前ホールのデータをスナップショットして保存、新ホールを取得
  useEffect(() => {
    if (prevHoleRef.current !== holeNumber) {
      // スナップショットを取得（stateが更新される前に）
      const snapshotState = stateRef.current;
      const snapshotAdvice = adviceMapRef.current;
      const prevHole = prevHoleRef.current;
      prevHoleRef.current = holeNumber;

      // 前ホールを非同期保存
      batchSave(prevHole, snapshotState, snapshotAdvice);
    }

    // 新ホールのデータ取得
    let cancelled = false;
    setError(null);
    setAdviceMap(new Map());
    getShots(roundId, holeNumber).then(data => {
      if (!cancelled) {
        dispatch({ type: 'INIT', shots: data });
        setExpandedIndex(data.length);
      }
    }).catch(() => {
      if (!cancelled) setError('ショット記録の取得に失敗しました。');
    });
    return () => { cancelled = true; };
  }, [roundId, holeNumber, batchSave]);

  const nextShotNumber = shots.length > 0
    ? Math.max(...shots.map(s => s.shot_number)) + 1
    : 1;

  // スロット一覧を構築
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
    {
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
    },
  ];

  const displaySlots = [...allSlots].reverse();

  const getForm = useCallback((index: number): ShotFormState => {
    return state.forms.get(index)
      ?? (index < shots.length ? shotToForm(shots[index]) : emptyShotForm());
  }, [state.forms, shots]);

  const handleAdviceReceived = useCallback((index: number, text: string) => {
    setAdviceMap(prev => new Map(prev).set(index, text));
  }, []);

  const handleAddShot = useCallback(() => {
    setExpandedIndex(shots.length);
  }, [shots.length]);

  return {
    displaySlots,
    expandedIndex,
    setExpandedIndex,
    getForm,
    dispatch,
    error,
    saveStatus,
    handleAdviceReceived,
    handleAddShot,
    shots,
  };
}

function collectPendingShotsSync(
  snapshotState: FormsState,
  snapshotAdvice: Map<number, string>,
  roundId: string,
  forHoleNumber: number,
) {
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
  }> = [];

  // 既存ショットで変更があるもの
  for (let i = 0; i < snapshotState.shots.length; i++) {
    const form = snapshotState.forms.get(i);
    const advice = snapshotAdvice.get(i);
    const shot = snapshotState.shots[i];
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

  // 新規スロット（全キーを走査し、値が入力済みのもの）
  const formKeys = Array.from(snapshotState.forms.keys()).filter(k => k >= snapshotState.shots.length).sort((a, b) => a - b);
  for (const i of formKeys) {
    const form = snapshotState.forms.get(i)!;
    if (!shouldSaveForm(form)) continue;
    const nextShotNum = snapshotState.shots.length > 0
      ? Math.max(...snapshotState.shots.map(s => s.shot_number)) + 1 + (i - snapshotState.shots.length)
      : i + 1;
    pending.push({
      shotNumber: nextShotNum,
      ...formToPayload(form),
      adviceText: snapshotAdvice.get(i) ?? null,
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
  };
}
