import { useReducer, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getShotsForRound, saveShotsForHole, type replaceShotsForHole } from '@/actions/shot';
import { updateFirstPuttDistance } from '@/actions/score';
import { emptyShotForm, shotToForm, hasFormChanged, shouldSaveForm } from '@/features/score/shot-constants';
import type { Shot, ShotFormState } from '@/features/score/types';
import { distanceToCategory } from '@/features/score/types';
import { LIE_DB_TO_LABEL, SHOT_TYPE_DB_TO_LABEL } from '@/lib/golf-constants';
import type { LocalShot } from '@/lib/offline-store';

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
  | { type: 'UPDATE_FIELD'; holeNumber: number; index: number; updater: (prev: ShotFormState) => ShotFormState; defaultDistance?: number | null }
  | { type: 'SET_ADVICE'; holeNumber: number; index: number; text: string }
  | { type: 'UPDATE_CACHE'; holeNumber: number; shots: Shot[]; version: number }
  | { type: 'INCREMENT_SAVE_VERSION'; holeNumber: number }
  | { type: 'CONFIRM_NEW_SHOT'; holeNumber: number; index: number; shot: Shot }
  | { type: 'CONFIRM_EDIT'; holeNumber: number; index: number; updatedShot: Shot }
  | { type: 'CANCEL_NEW_SHOT'; holeNumber: number; index: number }
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
      let current = holeForms.get(action.index);
      if (!current) {
        if (action.index < holeShots.length) {
          current = shotToForm(holeShots[action.index]);
        } else {
          current = emptyShotForm();
          // 新規1打目にはデフォルト距離を引き継ぐ（getFormと同じロジック）
          if (action.index === 0 && action.defaultDistance != null) {
            current = { ...current, remainingDistance: action.defaultDistance };
          }
        }
      }
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

    case 'CONFIRM_NEW_SHOT': {
      // 新規ショットをキャッシュに仮追加（isNew → 既存ショットとして扱う）
      const newCache = new Map(state.cache);
      const holeShots = [...(newCache.get(action.holeNumber) ?? []), action.shot];
      newCache.set(action.holeNumber, holeShots);
      // フォームデータはそのまま保持（batchSave時にDBへ書き込まれる）
      return { ...state, cache: newCache };
    }

    case 'CONFIRM_EDIT': {
      // 既存ショットのキャッシュをフォーム値で更新し、フォームをクリア
      const newCache = new Map(state.cache);
      const holeShots = [...(newCache.get(action.holeNumber) ?? [])];
      if (action.index < holeShots.length) {
        holeShots[action.index] = action.updatedShot;
        newCache.set(action.holeNumber, holeShots);
      }
      const newForms = new Map(state.formsByHole);
      const holeForms = newForms.get(action.holeNumber);
      if (holeForms) {
        const updated = new Map(holeForms);
        updated.delete(action.index);
        newForms.set(action.holeNumber, updated);
      }
      return { ...state, cache: newCache, formsByHole: newForms };
    }

    case 'CANCEL_NEW_SHOT': {
      // 新規ショットのフォームデータとアドバイスを破棄し、後続スロットを再インデックス
      const newForms = new Map(state.formsByHole);
      const holeForms = newForms.get(action.holeNumber);
      if (holeForms) {
        const updated = new Map<number, ShotFormState>();
        for (const [key, val] of holeForms) {
          if (key < action.index) updated.set(key, val);
          else if (key > action.index) updated.set(key - 1, val);
          // key === action.index は破棄
        }
        newForms.set(action.holeNumber, updated);
      }
      const newAdvice = new Map(state.adviceByHole);
      const holeAdvice = newAdvice.get(action.holeNumber);
      if (holeAdvice) {
        const updated = new Map<number, string>();
        for (const [key, val] of holeAdvice) {
          if (key < action.index) updated.set(key, val);
          else if (key > action.index) updated.set(key - 1, val);
        }
        newAdvice.set(action.holeNumber, updated);
      }
      return { ...state, formsByHole: newForms, adviceByHole: newAdvice };
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

export function useShotRecorder(roundId: string, holeNumber: number, holeDistance?: number | null, options?: { useOrchestratorSave?: boolean }) {
  const useOrchestratorSave = options?.useOrchestratorSave ?? false;
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

  // --- ホール切替: 前ホールのショットをDB保存（ショットはuseReducer管理のため画面遷移で消える） ---
  // When orchestrator manages saves, skip this auto-save (orchestrator handles it)
  useEffect(() => {
    if (useOrchestratorSave) {
      // Still track prevHole for the orchestrator to know when holes change
      prevHoleRef.current = holeNumber;
      return;
    }
    if (prevHoleRef.current !== holeNumber) {
      const prevHole = prevHoleRef.current;
      prevHoleRef.current = holeNumber;
      batchSave(prevHole, stateRef.current);
    }
  }, [holeNumber, batchSave, useOrchestratorSave]);

  // --- アンマウント時: 現在のホールのショットをDB保存 ---
  // When orchestrator manages saves, skip this (orchestrator handles unmount save)
  useEffect(() => {
    if (useOrchestratorSave) return;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useOrchestratorSave]);

  // --- 新規スロット表示管理（複数追加対応） ---
  const [newSlotCount, setNewSlotCount] = useState(0);
  // ホール切替時にリセット
  useEffect(() => {
    setNewSlotCount(0);
  }, [holeNumber]);

  // --- スロット一覧 ---
  const baseShotNumber = shots.length > 0
    ? Math.max(...shots.map(s => s.shot_number)) + 1
    : 1;

  const holeForms = state.formsByHole.get(holeNumber);

  const newSlots: ShotSlot[] = Array.from({ length: newSlotCount }, (_, i) => ({
    index: shots.length + i,
    shotNumber: baseShotNumber + i,
    isNew: true,
    shot: null,
    club: null,
    shotTypeLabel: null,
    distance: null,
    lieLabel: null,
    hasAdvice: false,
    isSkipped: false,
  }));

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
    ...newSlots,
  ];

  const displaySlots = [...allSlots].reverse();

  const getForm = useCallback((index: number): ShotFormState => {
    const saved = holeForms?.get(index);
    if (saved) return saved;
    if (index < shots.length) return shotToForm(shots[index]);
    const form = emptyShotForm();
    // 1打目の新規ショットにはホール総ヤードをデフォルトセット
    if (index === 0 && holeDistance != null) {
      form.remainingDistance = holeDistance;
    }
    return form;
  }, [holeForms, shots, holeDistance]);

  const handleAddShot = useCallback((): number => {
    const newIndex = shots.length + newSlotCount;
    setNewSlotCount(prev => prev + 1);
    return newIndex;
  }, [shots.length, newSlotCount]);

  /** 新規ショットをキャッシュに確定（一覧に表示されるようになる） */
  const confirmNewShot = useCallback((index: number) => {
    const form = stateRef.current.formsByHole.get(holeNumberRef.current)?.get(index);
    if (!form || !shouldSaveForm(form)) return;

    const shotNumber = shots.length > 0
      ? Math.max(...shots.map(s => s.shot_number)) + 1 + (index - shots.length)
      : index + 1;

    // キャッシュ用の仮Shotオブジェクト（DBのIDはbatchSave後に付与される）
    const tempShot: Shot = {
      id: '',
      round_id: roundIdRef.current,
      hole_number: holeNumberRef.current,
      shot_number: shotNumber,
      club: form.club,
      result: form.result,
      miss_type: form.missType,
      direction_lr: form.directionLr,
      direction_fb: form.directionFb,
      lie: form.lie,
      slope_fb: form.slopeFb,
      slope_lr: form.slopeLr,
      landing: form.landing,
      shot_type: form.shotType,
      remaining_distance: form.remainingDistance,
      note: form.note,
      advice_text: stateRef.current.adviceByHole.get(holeNumberRef.current)?.get(index) ?? null,
      wind_direction: form.windDirection,
      wind_strength: form.windStrength,
      elevation: form.elevation,
    };

    dispatch({ type: 'CONFIRM_NEW_SHOT', holeNumber: holeNumberRef.current, index, shot: tempShot });
    setNewSlotCount(prev => Math.max(0, prev - 1));
  }, [shots]);

  /** 既存ショットの編集をキャッシュに確定（「編集中」表示を解消） */
  const confirmEdit = useCallback((index: number) => {
    const form = stateRef.current.formsByHole.get(holeNumberRef.current)?.get(index);
    const existingShot = stateRef.current.cache.get(holeNumberRef.current)?.[index];
    if (!form || !existingShot) return;

    const updatedShot: Shot = {
      ...existingShot,
      club: form.club,
      result: form.result,
      miss_type: form.missType,
      direction_lr: form.directionLr,
      direction_fb: form.directionFb,
      lie: form.lie,
      slope_fb: form.slopeFb,
      slope_lr: form.slopeLr,
      landing: form.landing,
      shot_type: form.shotType,
      remaining_distance: form.remainingDistance,
      note: form.note,
      wind_direction: form.windDirection,
      wind_strength: form.windStrength,
      elevation: form.elevation,
      advice_text: stateRef.current.adviceByHole.get(holeNumberRef.current)?.get(index) ?? existingShot.advice_text,
    };

    dispatch({ type: 'CONFIRM_EDIT', holeNumber: holeNumberRef.current, index, updatedShot });
  }, []);

  /** 新規ショットをキャンセル（フォームデータを破棄） */
  const cancelNewShot = useCallback((index: number) => {
    dispatch({ type: 'CANCEL_NEW_SHOT', holeNumber: holeNumberRef.current, index });
    setNewSlotCount(prev => Math.max(0, prev - 1));
  }, []);

  // dispatch ラッパー: shot-form からの action に holeNumber を自動付与
  const holeDistanceRef = useRef(holeDistance);
  useEffect(() => { holeDistanceRef.current = holeDistance; }, [holeDistance]);

  const dispatchWithHole = useCallback((action: ShotFormAction) => {
    if (action.type === 'UPDATE_FIELD') {
      dispatch({ ...action, holeNumber: holeNumberRef.current, defaultDistance: holeDistanceRef.current });
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

  // --- Orchestrator integration methods ---

  /** Collect shots for a given hole as LocalShot[] for IndexedDB storage */
  const getShotsForHoleLocal = useCallback((holeNum: number): LocalShot[] | null => {
    const snapshot = stateRef.current;
    const holeShots = snapshot.cache.get(holeNum) ?? [];
    const holeForms = snapshot.formsByHole.get(holeNum);
    const holeAdvice = snapshot.adviceByHole.get(holeNum);

    // If no forms edited and no cached shots, nothing to save
    if (holeShots.length === 0 && (!holeForms || holeForms.size === 0)) return null;

    // Build LocalShot[] from cache + form overrides
    const result: LocalShot[] = [];

    // Existing shots (with form overrides if any)
    for (let i = 0; i < holeShots.length; i++) {
      const shot = holeShots[i];
      const form = holeForms?.get(i);
      const advice = holeAdvice?.get(i);
      const base = form ? {
        ...shot,
        club: form.club,
        result: form.result,
        miss_type: form.missType,
        direction_lr: form.directionLr,
        direction_fb: form.directionFb,
        lie: form.lie,
        slope_fb: form.slopeFb,
        slope_lr: form.slopeLr,
        landing: form.landing,
        shot_type: form.shotType,
        remaining_distance: form.remainingDistance,
        note: form.note,
        wind_direction: form.windDirection,
        wind_strength: form.windStrength,
        elevation: form.elevation,
        advice_text: advice ?? shot.advice_text,
      } : shot;
      result.push({
        ...base,
        clientId: (base as LocalShot).clientId || crypto.randomUUID(),
        version: 0,
        syncedVersion: 0,
      } as LocalShot);
    }

    // New slots (form entries beyond cache length)
    if (holeForms) {
      const newKeys = Array.from(holeForms.keys()).filter(k => k >= holeShots.length).sort((a, b) => a - b);
      for (const i of newKeys) {
        const form = holeForms.get(i)!;
        if (!shouldSaveForm(form)) continue;
        const nextShotNum = holeShots.length > 0
          ? Math.max(...holeShots.map(s => s.shot_number)) + 1 + (i - holeShots.length)
          : i + 1;
        result.push({
          id: '',
          round_id: roundIdRef.current,
          hole_number: holeNum,
          shot_number: nextShotNum,
          club: form.club,
          result: form.result,
          miss_type: form.missType,
          direction_lr: form.directionLr,
          direction_fb: form.directionFb,
          lie: form.lie,
          slope_fb: form.slopeFb,
          slope_lr: form.slopeLr,
          landing: form.landing,
          shot_type: form.shotType,
          remaining_distance: form.remainingDistance,
          note: form.note,
          advice_text: holeAdvice?.get(i) ?? null,
          wind_direction: form.windDirection,
          wind_strength: form.windStrength,
          elevation: form.elevation,
          clientId: crypto.randomUUID(),
          version: 0,
          syncedVersion: 0,
        } as LocalShot);
      }
    }

    return result.length > 0 ? result : null;
  }, []);

  /** Build the replaceShotsForHole server action payload for a given hole.
   *  Uses getShotsForHoleLocal to send ALL shots (replace strategy requires full state). */
  const buildShotSyncPayload = useCallback((holeNum: number): Parameters<typeof replaceShotsForHole>[0] | null => {
    const localShots = getShotsForHoleLocal(holeNum);
    // Return payload even if empty (empty array = delete all on server)
    return {
      roundId: roundIdRef.current,
      holeNumber: holeNum,
      shots: (localShots ?? []).map(s => ({
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
    };
  }, [getShotsForHoleLocal]);

  return {
    displaySlots,
    expandedIndex,
    setExpandedIndex,
    getForm,
    dispatch: dispatchWithHole,
    error,
    saveStatus,
    handleAddShot,
    confirmNewShot,
    confirmEdit,
    cancelNewShot,
    shots,
    loading: state.loading,
    saveCurrentHole,
    hasPendingShots,
    // Orchestrator integration
    getShotsForHoleLocal,
    buildShotSyncPayload,
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
