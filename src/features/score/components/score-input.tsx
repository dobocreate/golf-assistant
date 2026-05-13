'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Save, CheckCircle, Users, Plus, MessageCircle, X, Route, AlertCircle } from 'lucide-react';
import { SaveStatusIndicator } from '@/components/ui/save-status-indicator';
import { SyncStatusIndicator } from '@/features/score/components/sync-status-indicator';
import { HoleNavigation } from '@/components/ui/hole-navigation';
import { Stepper } from '@/components/ui/stepper';
import { ShotRecorder, type ShotActionsHandle } from '@/features/score/components/shot-recorder';
import { useToast } from '@/components/ui/toast';
import { usePlayRoundOptional } from '@/features/play/context/play-round-context';
import type { Score, HoleInfo, Companion, CompanionScore, Shot } from '@/features/score/types';
import { CompanionScoreModal, getCompanionInputsForHole, type CompanionHoleInput } from '@/features/score/components/companion-score-modal';
import type { WindDirection, WindStrength } from '@/features/round/types';
import { ManagementBand } from '@/features/score/components/management-band';
import type { GamePlan } from '@/features/game-plan/types';
import { useSaveOrchestrator } from '@/features/score/hooks/use-save-orchestrator';
import { checkIndexedDBAvailability, type LocalScore, type LocalShot } from '@/lib/offline-store';
import type { replaceShotsForHole } from '@/actions/shot';
// Sprint 6 PR3: マルチショット位置編集 UI 統合
import { MultiShotPositionEditor } from '@/features/score/components/multi-shot-position-editor';
import { buildDisplayedShots } from '@/features/score/hooks/use-displayed-shots';
import { getHoleMapDataForRoundHole, type HoleMapData } from '@/actions/hole-map';
import { computeShotPosition, updateShotPosition, revertShotPositionToOriginal } from '@/actions/shot-position';
import { Loader2 } from 'lucide-react';
import type {
  SaveShotPosition,
  RevertShotPosition,
} from '@/features/score/hooks/use-multi-shot-edit';
import type { AerialImageMetadata, HoleArea } from '@/lib/geo';


interface ClubOption {
  name: string;
}

interface ScoreInputProps {
  roundId: string;
  holes: HoleInfo[];
  initialScores: Score[];
  courseName: string;
  clubs?: ClubOption[];
  editMode?: boolean;
  startingCourse?: 'out' | 'in';
  initialHole?: number;
  gamePlans?: GamePlan[];
  targetScore?: number | null;
  scoreLevel?: string | null;
  handicap?: number | null;
  companions?: Companion[];
  initialCompanionScores?: CompanionScore[];
}

// デフォルトのホール情報（holes テーブルにデータがない場合）
function getDefaultHoles(): HoleInfo[] {
  return Array.from({ length: 18 }, (_, i) => ({
    hole_number: i + 1,
    par: 4,
    distance: null,
  }));
}

// ホール順序を生成: INスタートなら 10-18, 1-9
function getHoleOrder(startingCourse: 'out' | 'in'): number[] {
  if (startingCourse === 'in') {
    return [...Array.from({ length: 9 }, (_, i) => i + 10), ...Array.from({ length: 9 }, (_, i) => i + 1)];
  }
  return Array.from({ length: 18 }, (_, i) => i + 1);
}

export function ScoreInput({ roundId, holes: rawHoles, initialScores, courseName, clubs = [], editMode = false, startingCourse = 'out', initialHole, gamePlans = [], targetScore = null, scoreLevel = null, handicap = null, companions = [], initialCompanionScores = [] }: ScoreInputProps) {
  const { showToast } = useToast();
  const router = useRouter();
  const holes = rawHoles.length > 0 ? rawHoles : getDefaultHoles();
  const holeOrder = useMemo(() => getHoleOrder(startingCourse), [startingCourse]);
  const playRound = usePlayRoundOptional();
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const completeDismissedRef = useRef(false);
  const [showStrategyModal, setShowStrategyModal] = useState(false);
  // 戦略モーダル表示中は背景スクロールを防止
  useEffect(() => {
    if (showStrategyModal) {
      const orig = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = orig; };
    }
  }, [showStrategyModal]);

  // 初期ホール決定: searchParams > localStorage > holeOrder[0]
  const initialHoleResolved = useMemo(() => {
    const validHoles = new Set(holeOrder);
    if (initialHole && validHoles.has(initialHole)) return initialHole;
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`golf-last-hole-${roundId}`);
      if (saved) {
        const num = parseInt(saved, 10);
        if (validHoles.has(num)) return num;
      }
    }
    return holeOrder[0];
  }, [holeOrder, initialHole, roundId]);
  const [currentHole, setCurrentHole] = useState(initialHoleResolved);

  // --- 同伴者スコア ---
  const hasCompanions = companions.length > 0;
  const [showCompanionModal, setShowCompanionModal] = useState(false);
  const companionScoresMapRef = useRef<Map<string, Map<number, CompanionScore>> | null>(null);
  if (companionScoresMapRef.current === null) {
    const map = new Map<string, Map<number, CompanionScore>>();
    for (const cs of initialCompanionScores) {
      if (!map.has(cs.companion_id)) map.set(cs.companion_id, new Map());
      map.get(cs.companion_id)!.set(cs.hole_number, cs);
    }
    companionScoresMapRef.current = map;
  }
  // 全18ホール分の同伴者入力を保持する権威ある参照。
  // orchestrator コールバックは currentHole の状態に依存せず、常にここから読む。
  // （setState の遅延で「保存ボタン/ホール切替」と競合するのを防ぐ）
  const allCompanionInputsRef = useRef<Map<number, CompanionHoleInput[]> | null>(null);
  if (allCompanionInputsRef.current === null) {
    const map = new Map<number, CompanionHoleInput[]>();
    for (let h = 1; h <= 18; h++) {
      map.set(h, getCompanionInputsForHole(companions, companionScoresMapRef.current!, h));
    }
    allCompanionInputsRef.current = map;
  }
  const [companionInputs, setCompanionInputs] = useState<CompanionHoleInput[]>(() =>
    allCompanionInputsRef.current!.get(initialHoleResolved) ?? [],
  );

  // companions プロップ変更時に allCompanionInputsRef を再同期
  // （追加: 空値で追加 / 削除: エントリから除外 / 既存値は保持）
  useEffect(() => {
    const all = allCompanionInputsRef.current;
    if (!all) return;
    for (let h = 1; h <= 18; h++) {
      const existing = all.get(h) ?? [];
      const existingMap = new Map(existing.map(i => [i.companionId, i]));
      const merged: CompanionHoleInput[] = companions.map(c =>
        existingMap.get(c.id) ?? { companionId: c.id, strokes: null, putts: null },
      );
      all.set(h, merged);
    }
  }, [companions]);

  /** モーダルの OK ボタン押下時に draft を権威ソース / state に確定 */
  const handleCompanionCommit = useCallback((draft: CompanionHoleInput[]) => {
    const all = allCompanionInputsRef.current;
    if (!all) return;
    // 同期的にリファレンスを更新してから React ステートを更新
    // （直後の保存ボタン/ホール切替で orchestrator が最新値を参照可能にする）
    all.set(currentHole, draft);
    setCompanionInputs(draft);
  }, [currentHole]);

  const shotRecorderRef = useRef<HTMLDivElement>(null);
  const shotActionsRef = useRef<ShotActionsHandle>({
    saveCurrentHole: () => {},
    hasPendingShots: () => false,
    getLandingCounts: () => ({ ob: 0, bunker: 0 }),
    addShot: () => {},
  });

  // Sprint 6 PR3: マルチショット軌跡編集モーダル
  type MapData = { aerialImageUrl: string; metadata: AerialImageMetadata; areas: HoleArea[] };
  const [multiEditing, setMultiEditing] = useState<{
    holeNumber: number;
    mapData: MapData;
    shots: Shot[];
  } | null>(null);
  const [actionAlert, setActionAlert] = useState<string | null>(null);
  // 「軌跡を編集」ボタン押下時の地図データ取得中フラグ (Gemini Medium #2)
  const [multiEditLoading, setMultiEditLoading] = useState(false);

  // multiEditing.shots 内の slot index を解決する helper
  // - 保存済み (id !== ''): id で照合
  // - 未保存 (id === ''): shot_number で照合 (同ホール内で一意)
  const findSlotIndex = useCallback((shot: Shot): number => {
    if (!multiEditing) return -1;
    return multiEditing.shots.findIndex((s) =>
      s.id !== '' ? s.id === shot.id : s.id === '' && s.shot_number === shot.shot_number,
    );
  }, [multiEditing]);

  // Sprint 6 PR3: MultiShotPositionEditor へ inject する saveShotPosition callback
  // - 保存済みショット (shot.id !== ''): updateShotPosition Server Action + dispatch UPDATE_CACHED_SHOT
  // - 未保存ショット (shot.id === ''): dispatch UPDATE_FIELD で form state へ書き戻し (次回 batchSave で永続化)
  // - Sprint 7 PR2: 自動軌跡スロット (id='' かつ shot_number が cache + form に存在しない) は
  //   保存スコープ外 (PR3 で対応)。ドラッグは可能だが確定で alert 表示してエラー返却
  const saveShotPositionForPlay: SaveShotPosition = useCallback(
    async ({ shot, draft }) => {
      // Sprint 7 PR2: 自動軌跡スロット判定 (cache + form に存在しない shot_number)
      // - shot.hole_number で localShots を引く (currentHoleRef.current だと async race リスク、M2 対応)
      // - 暗黙契約: getShotsForHoleLocal は shouldSaveForm 通過後の form のみ返す
      //   (use-shot-recorder.ts:621)。そのため空 form は localShots に含まれず、
      //   buildDisplayedShots の existingMap にも入らない → ここの自動判定が正しく機能する。
      //   getShotsForHoleLocal の filter 仕様変更時はこのガードも見直し必要。
      // C1 対応: 自動スロットは ok: true で擬似コミット (latestShot=元 shot で visual を維持)
      // → useMultiShotEdit.commit が draft 破棄するため、コミット永久ループに陥らない
      // → DB には何も書かれず、次回開くと自動軌跡が再描画される
      if (shot.id === '') {
        const localShots = shotActionsRef.current.getShotsForHoleLocal?.(shot.hole_number) ?? [];
        const isAutoSlot = !localShots.some((s) => s.shot_number === shot.shot_number);
        if (isAutoSlot) {
          setActionAlert(
            '自動軌跡スロットの保存は次回アップデートで対応予定です。詳細を記録するには「ショット追加」から個別に登録してください。',
          );
          // ok: true + latestShot=元 shot で「擬似コミット」: useMultiShotEdit が draft 破棄
          // visual は元の自動軌跡位置に戻る (alert で説明済み)
          return { ok: true, latestShot: shot };
        }
      }

      const slotIndex = findSlotIndex(shot);
      if (slotIndex < 0) {
        console.warn('saveShotPositionForPlay: slotIndex not found for shot', shot);
        return { ok: false, error: 'failed' };
      }

      if (shot.id !== '') {
        // 保存済みショット: DB 更新 + cache 同期
        const { shot: updated, error: updErr, latestShot } = await updateShotPosition({
          shotId: shot.id,
          latitude: draft.lat,
          longitude: draft.lng,
          gpsSource: draft.source,
          accuracyM: draft.accuracyM,
          expectedRevision: shot.position_revision,
        });
        if (updErr) {
          if (updErr === 'conflict') {
            if (latestShot) {
              shotActionsRef.current.applyLocalShotPositionPatch?.({
                type: 'cached',
                slotIndex,
                updatedShot: latestShot,
              });
              return { ok: false, error: 'conflict', latestShot };
            }
            console.warn('updateShotPosition conflict but latestShot unavailable');
            return { ok: false, error: 'failed' };
          }
          console.warn('updateShotPosition failed:', updErr);
          return { ok: false, error: 'failed' };
        }
        if (updated) {
          shotActionsRef.current.applyLocalShotPositionPatch?.({
            type: 'cached',
            slotIndex,
            updatedShot: updated,
          });
        }
        return { ok: true, latestShot: updated };
      }

      // 未保存ショット: lie / 残距離も同期させるため computeShotPosition を呼ぶ
      // (Gemini Medium #1: auto_lie / remaining_to_green_m がドラッグ後も古いままになる問題)
      // 失敗してもサイレントに座標のみ反映 (致命的ではない)
      type ComputeResult = Awaited<ReturnType<typeof computeShotPosition>>['result'];
      let pos: ComputeResult | null = null;
      try {
        const ret = await computeShotPosition({
          roundId: roundIdRef.current,
          holeNumber: shot.hole_number,
          latitude: draft.lat,
          longitude: draft.lng,
          accuracyM: draft.accuracyM ?? 0,
        });
        pos = ret.result ?? null;
      } catch (err) {
        console.warn('computeShotPosition (form unsaved) failed:', err);
      }

      // 未保存ショット: form state に書き戻し (次回 batchSave で永続化)
      shotActionsRef.current.applyLocalShotPositionPatch?.({
        type: 'form',
        slotIndex,
        formPatch: {
          latitude: draft.lat,
          longitude: draft.lng,
          gpsSource: draft.source,
          gpsAccuracyM: draft.accuracyM,
          // capturedAt は GPS 取得時のみ意味があるため manual_edit ではセットしない
          autoLie: pos?.autoLie ?? null,
          autoLieConfidence: pos?.autoLieConfidence ?? null,
          remainingToGreenM: pos?.remainingToGreenM ?? null,
        },
      });
      // 未保存変更の dirty 通知 (Codex M1 / code-reviewer M1): beforeunload / Save indicator のため
      setShotsDirty(true);
      // useMultiShotEdit が liveShots を更新できるよう、合成 latestShot を返す
      // (Codex P2-1 対応: form 経路で latestShot=null だと marker が古い座標に戻る)
      const synthesizedLatest: Shot = {
        ...shot,
        latitude: draft.lat,
        longitude: draft.lng,
        gps_source: draft.source,
        gps_accuracy_m: draft.accuracyM,
        auto_lie: pos?.autoLie ?? shot.auto_lie,
        auto_lie_confidence: pos?.autoLieConfidence ?? shot.auto_lie_confidence,
        remaining_to_green_m: pos?.remainingToGreenM ?? shot.remaining_to_green_m,
      };
      return { ok: true, latestShot: synthesizedLatest };
    },
    [findSlotIndex],
  );

  // Sprint 6 PR3: revertShotPosition callback (保存済みショット限定)
  const revertShotPositionForPlay: RevertShotPosition = useCallback(async (shot) => {
    if (shot.id === '') {
      // 未保存ショットは元位置概念がないので no-op
      return { ok: false, error: 'failed' };
    }
    const slotIndex = findSlotIndex(shot);
    if (slotIndex < 0) return { ok: false, error: 'failed' };

    const { shot: reverted, error, latestShot } = await revertShotPositionToOriginal(
      shot.id,
      shot.position_revision,
    );
    if (error) {
      // updateShotPosition 用の分岐と統一 (code-reviewer M2)
      if (error === 'conflict') {
        if (latestShot) {
          shotActionsRef.current.applyLocalShotPositionPatch?.({
            type: 'cached',
            slotIndex,
            updatedShot: latestShot,
          });
          return { ok: false, error: 'conflict', latestShot };
        }
        console.warn('revertShotPositionToOriginal conflict but latestShot unavailable');
        return { ok: false, error: 'failed' };
      }
      console.warn('revertShotPositionToOriginal failed:', error);
      return { ok: false, error: 'failed' };
    }
    if (reverted) {
      shotActionsRef.current.applyLocalShotPositionPatch?.({
        type: 'cached',
        slotIndex,
        updatedShot: reverted,
      });
    }
    return { ok: true, latestShot: reverted };
  }, [findSlotIndex]);

  // 「軌跡を編集」ボタンクリック → mapData 取得 + 自動軌跡を含む shots を準備 → MultiShotPositionEditor 起動
  // Sprint 7 PR2: 既存ショット記録がなくても自動軌跡で起動可能 (Par + 一律 2 パットで自動補完)
  const handleMultiEditClick = useCallback(async () => {
    // 重複ガード (Gemini Medium #2: 二重クリック防止)
    if (multiEditLoading) return;
    // M1 対応: 関数開始時のホール番号をスナップショットして以降の async 中の race を回避
    const targetHole = currentHoleRef.current;
    setMultiEditLoading(true);
    let data: HoleMapData | null = null;
    try {
      data = await getHoleMapDataForRoundHole(roundId, targetHole);
    } catch (err) {
      // ネットワーク / Server Action 例外: ユーザーに通知して終了 (code-reviewer m2)
      console.error('getHoleMapDataForRoundHole failed:', err);
      setActionAlert('地図データの読み込みに失敗しました。通信状況を確認してください。');
      setMultiEditLoading(false);
      return;
    }
    if (!data) {
      setActionAlert('このホールは地図データが未整備のため、軌跡編集はできません。');
      setMultiEditLoading(false);
      return;
    }

    // M1 対応: 開始時から currentHole が変化していたら捨てる (race 防止の最終ガード)
    if (currentHoleRef.current !== targetHole) {
      setMultiEditLoading(false);
      return;
    }

    // Sprint 7 PR2: 自動軌跡で displayedShots を構築 (詳細記録 + 不足分自動補完)
    const localShots = shotActionsRef.current.getShotsForHoleLocal?.(targetHole) ?? [];
    const currentInput = currentInputRef.current;
    const holeInfo = holes.find((h) => h.hole_number === targetHole);
    const par = holeInfo?.par ?? 4;
    const { displayedShots, mismatchWarning } = buildDisplayedShots({
      existingShots: localShots as Shot[],
      strokes: currentInput.strokes,
      putts: currentInput.putts,
      par,
      holeNumber: targetHole,
      roundId,
      mapData: data,
      activeGreen: null, // 将来 Round.active_green を ScoreInput props 経由で受け取り (PR3+)
    });

    if (mismatchWarning) {
      setActionAlert(mismatchWarning);
    } else {
      setActionAlert(null);
    }

    setMultiEditing({
      holeNumber: targetHole,
      mapData: data,
      shots: displayedShots,
    });
    setMultiEditLoading(false);
  }, [roundId, multiEditLoading, holes]);

  // --- Save Orchestrator ---
  const orchestrator = useSaveOrchestrator(roundId);
  const currentHoleRef = useRef(initialHoleResolved);

  // --- IndexedDB availability check (once on mount) ---
  const [idbAvailable, setIdbAvailable] = useState(true);
  useEffect(() => {
    checkIndexedDBAvailability().then(setIdbAvailable);
  }, []);

  // PlayRoundContext の currentHole をローカルステートと同期（ローカル→Context 一方向）
  useEffect(() => {
    playRound?.setCurrentHole(currentHole);
  }, [playRound, currentHole]);
  const [scores, setScoresRaw] = useState<Map<number, Score>>(() => {
    const map = new Map<number, Score>();
    for (const s of initialScores) {
      map.set(s.hole_number, s);
    }
    return map;
  });
  // scores更新をラップ（型互換のため）
  const setScores = useCallback((updater: Map<number, Score> | ((prev: Map<number, Score>) => Map<number, Score>)) => {
    setScoresRaw(updater);
  }, []);
  const totalOBCount = useMemo(
    () => Array.from(scores.values()).reduce((sum, s) => sum + (s.ob_count ?? 0), 0),
    [scores],
  );
  // 保存状態: 'idle' | 'saving' | 'saved' | 'error'
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // ショット変更のdirtyフラグ（ShotRecorderから通知される）
  const [shotsDirty, setShotsDirty] = useState(false);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // アンマウント時にタイマーをクリーンアップ + 未保存スコアをfire-and-forget保存
  const roundIdRef = useRef(roundId);
  useEffect(() => { roundIdRef.current = roundId; }, [roundId]);

  useEffect(() => {
    return () => {
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
      // アンマウント時の保存はオーケストレーターが担当（orchestrator.onBackgroundSave）
    };
  }, []);
  // 保存失敗時のリトライ情報
  const [failedSave, setFailedSave] = useState<{
    holeNum: number;
    strokes: number;
    putts: number | null;
    gir: boolean | null;
    wd: WindDirection | null;
    ws: WindStrength | null;
    existingId?: string;
  } | null>(null);

  const hole = holes.find(h => h.hole_number === currentHole) ?? { hole_number: currentHole, par: 4, distance: null };
  const score = scores.get(currentHole);

  const [strokes, setStrokes] = useState<number | null>(score?.strokes ?? null);
  const [putts, setPutts] = useState<number | null>(score?.putts ?? null);
  const [windDirection, setWindDirection] = useState<WindDirection | null>(score?.wind_direction ?? null);
  const [windStrength, setWindStrength] = useState<WindStrength | null>(score?.wind_strength ?? null);
  const [greenInReg, setGreenInReg] = useState<boolean | null>(score?.green_in_reg ?? null);
  const [obCount, setObCount] = useState<number>(score?.ob_count ?? 0);
  const [bunkerCount, setBunkerCount] = useState<number>(score?.bunker_count ?? 0);
  // ユーザーが明示的にスコアを操作したかどうか（デフォルト値の自動保存防止用）
  const [userTouched, setUserTouched] = useState(score !== undefined);

  // isDirty: scores Map（保存済みデータ）と現在入力値の比較で導出
  const isDirty = useMemo(() => {
    if (shotsDirty) return true; // ショット変更あり
    if (strokes === null) return false; // 未入力 → dirty ではない
    const saved = scores.get(currentHole);
    if (!saved) return true; // 保存データなし、入力あり → dirty
    // 非editMode では OB/バンカー数はショット記録から導出される（landing）
    // editMode では stepper で直接入力された obCount/bunkerCount を使う
    const landing = shotActionsRef.current.getLandingCounts();
    const effectiveOb = editMode ? obCount : landing.ob;
    const effectiveBunker = editMode ? bunkerCount : landing.bunker;
    return saved.strokes !== strokes
      || saved.putts !== putts
      || saved.green_in_reg !== greenInReg
      || saved.wind_direction !== windDirection
      || saved.wind_strength !== windStrength
      || (saved.ob_count ?? 0) !== effectiveOb
      || (saved.bunker_count ?? 0) !== effectiveBunker;
  }, [scores, currentHole, strokes, putts, greenInReg, windDirection, windStrength, obCount, bunkerCount, shotsDirty, editMode]);

  // --- 未保存データのブラウザ離脱警告 ---
  const isDirtyRef = useRef(false);
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [roundId]);

  // 直前のスコアを保持（ロールバック用）
  const previousScoreRef = useRef<Score | undefined>(undefined);

  // greenInReg 自動判定
  const computeGreenInReg = useCallback((s: number | null, p: number | null, par: number): boolean | null => {
    if (s === null || p === null) return null;
    return (s - p) <= (par - 2);
  }, []);

  // strokes/putts 変更時に greenInReg を自動計算
  useEffect(() => {
    setGreenInReg(computeGreenInReg(strokes, putts, hole.par));
  }, [strokes, putts, hole.par, computeGreenInReg]);

  const handleSave = useCallback(() => {
    if (strokes === null) return;
    setUserTouched(true);
    // 設計通り、変更検知なしで無条件にオーケストレーターに委譲
    // オーケストレーターが全データタイプ（スコア/ショット/同伴者）を
    // collectData → IndexedDB → buildSyncPayload → DB同期する
    orchestrator.onSaveButton(currentHole);
    setShotsDirty(false);
    // scoresMapを同期更新（isDirty useMemoが即座にfalseを返すように）
    const existing = scoresRef.current.get(currentHole);
    const landing = shotActionsRef.current.getLandingCounts();
    // editMode ではステッパー入力値、非editMode ではショット記録由来の landing を保存
    const effectiveOb = editMode ? obCount : landing.ob;
    const effectiveBunker = editMode ? bunkerCount : landing.bunker;
    scoresRef.current = new Map(scoresRef.current).set(currentHole, {
      ...(existing ?? {} as Score),
      id: existing?.id ?? '',
      round_id: roundId,
      hole_number: currentHole,
      strokes,
      putts,
      green_in_reg: greenInReg,
      wind_direction: windDirection,
      wind_strength: windStrength,
      ob_count: effectiveOb,
      bunker_count: effectiveBunker,
    });
    setScores(scoresRef.current);
  }, [currentHole, strokes, putts, greenInReg, windDirection, windStrength, obCount, bunkerCount, roundId, orchestrator, editMode]);

  // スコアMapへの参照（switchHoleでの同期用）
  const scoresRef = useRef(scores);
  useEffect(() => {
    scoresRef.current = scores;
  }, [scores]);

  // 現在の入力値を ref で保持（switchHole の依存配列を最小化するため）
  const currentInputRef = useRef({ strokes, putts, greenInReg, windDirection, windStrength, currentHole, scoreId: score?.id, userTouched, obCount, bunkerCount, editMode });
  useEffect(() => {
    currentInputRef.current = { strokes, putts, greenInReg, windDirection, windStrength, currentHole, scoreId: score?.id, userTouched, obCount, bunkerCount, editMode };
  }, [strokes, putts, greenInReg, windDirection, windStrength, currentHole, score?.id, userTouched, obCount, bunkerCount, editMode]);

  // --- Register orchestrator score callbacks ---
  useEffect(() => {
    orchestrator.registerScoreCallbacks({
      collectData: (hole: number): Partial<LocalScore> | null => {
        const { strokes: st, putts: pt, greenInReg: gir, windDirection: wd, windStrength: ws, currentHole: ch, userTouched: touched, obCount: ob, bunkerCount: bk, editMode: em } = currentInputRef.current;
        // Only collect data for the current hole being edited
        if (hole === ch && touched && st !== null) {
          const existing = scoresRef.current.get(hole);
          const landing = shotActionsRef.current.getLandingCounts();
          const effectiveOb = em ? ob : landing.ob;
          const effectiveBunker = em ? bk : landing.bunker;
          return {
            id: existing?.id ?? '',
            round_id: roundIdRef.current,
            hole_number: hole,
            strokes: st,
            putts: pt,
            green_in_reg: gir,
            wind_direction: wd,
            wind_strength: ws,
            ob_count: effectiveOb,
            bunker_count: effectiveBunker,
          } as Partial<LocalScore>;
        }
        // For non-current holes, check the scores Map
        const saved = scoresRef.current.get(hole);
        if (saved) {
          return { ...saved } as Partial<LocalScore>;
        }
        return null;
      },
      buildSyncPayload: (hole: number) => {
        const { strokes: st, putts: pt, greenInReg: gir, windDirection: wd, windStrength: ws, currentHole: ch, userTouched: touched, obCount: ob, bunkerCount: bk, editMode: em } = currentInputRef.current;
        let s: number | null = null;
        let p: number | null = null;
        let g: boolean | null = null;
        let wDir: WindDirection | null = null;
        let wStr: WindStrength | null = null;

        if (hole === ch && touched) {
          s = st;
          p = pt;
          g = gir;
          wDir = wd;
          wStr = ws;
        } else {
          const saved = scoresRef.current.get(hole);
          if (saved) {
            s = saved.strokes;
            p = saved.putts;
            g = saved.green_in_reg;
            wDir = saved.wind_direction;
            wStr = saved.wind_strength;
          }
        }

        if (s === null) return null;

        const existing = scoresRef.current.get(hole);
        const landing = shotActionsRef.current.getLandingCounts();
        const effectiveOb = em ? ob : landing.ob;
        const effectiveBunker = em ? bk : landing.bunker;
        return {
          roundId: roundIdRef.current,
          holeNumber: hole,
          strokes: s,
          putts: p,
          fairwayHit: null,
          greenInReg: g,
          teeShotLr: null,
          teeShotFb: null,
          obCount: effectiveOb,
          bunkerCount: effectiveBunker,
          penaltyCount: 0,
          firstPuttDistance: existing?.first_putt_distance ?? null,
          firstPuttDistanceM: existing?.first_putt_distance_m ?? null,
          windDirection: wDir,
          windStrength: wStr,
          skipRevalidate: true,
        };
      },
    });
  }); // Intentionally no deps - always register latest closures

  // --- Register orchestrator shot callbacks ---
  useEffect(() => {
    orchestrator.registerShotCallbacks({
      collectData: (hole: number) => {
        return shotActionsRef.current.getShotsForHoleLocal?.(hole) ?? null;
      },
      buildSyncPayload: (hole: number) => {
        return shotActionsRef.current.buildShotSyncPayload?.(hole) ?? null;
      },
    });
  }); // Intentionally no deps

  // --- Register orchestrator companion callbacks ---
  useEffect(() => {
    orchestrator.registerCompanionCallbacks({
      collectData: (hole: number) => {
        // allCompanionInputsRef を権威ソースとして使う（currentHole に依存しない）
        const inputs = allCompanionInputsRef.current?.get(hole);
        if (!inputs || inputs.length === 0) return null;
        const map: Map<string, { strokes: string; putts: string }> = new Map();
        inputs.forEach(i => {
          map.set(i.companionId, {
            strokes: i.strokes !== null ? String(i.strokes) : '',
            putts: i.putts !== null ? String(i.putts) : '',
          });
        });
        return map;
      },
      buildSyncPayload: (hole: number) => {
        if (!hasCompanions) return null;
        const inputs = allCompanionInputsRef.current?.get(hole);
        if (!inputs || inputs.length === 0) return null;
        return {
          roundId,
          holeNumber: hole,
          scores: inputs.map(i => ({
            companionId: i.companionId,
            strokes: i.strokes,
            putts: i.putts,
          })),
        };
      },
    });
  }); // Intentionally no deps

  // Keep currentHoleRef in sync
  useEffect(() => {
    currentHoleRef.current = currentHole;
  }, [currentHole]);

  // --- Orchestrator triggers: visibilitychange, idle 5s, unmount, online restore ---
  useEffect(() => {
    const handler = () => {
      if (document.hidden) orchestrator.onBackgroundSave(currentHoleRef.current);
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [orchestrator]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => orchestrator.onBackgroundSave(currentHoleRef.current), 5000);
    };
    const events = ['touchstart', 'click', 'keydown'] as const;
    events.forEach(e => document.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      clearTimeout(timer);
      events.forEach(e => document.removeEventListener(e, resetTimer));
    };
  }, [orchestrator]);

  useEffect(() => {
    const handler = () => { orchestrator.onOnlineRestore(); };
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }, [orchestrator]);

  // Orchestrator unmount save
  useEffect(() => {
    return () => orchestrator.onBackgroundSave(currentHoleRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ホール切り替え: 現在ホールの入力値をscores Mapに反映してからホール切替
  const switchHole = useCallback((holeNum: number) => {
    // Sprint 6 PR3 (M2 防御): MultiShotPositionEditor open 中はホール切替を抑止
    // (open 中に shots props が切り替わると drafts が古いホールのまま残る race condition を防ぐ)
    if (multiEditing) {
      setActionAlert('軌跡編集を完了または閉じてからホールを切り替えてください。');
      return;
    }
    const { strokes: st, putts: pt, greenInReg: gir, windDirection: wd, windStrength: ws, currentHole: ch, scoreId, userTouched: touched } = currentInputRef.current;
    // 現在ホールの入力値をメモリのscores Mapに反映
    // scoresRefも同期的に更新（orchestrator executorがbuildSyncPayloadで参照するため）
    if (touched && st !== null) {
      const existing = scoresRef.current.get(ch);
      const updatedScore = {
        ...(existing ?? {} as Score),
        id: scoreId ?? existing?.id ?? '',
        round_id: roundId,
        hole_number: ch,
        strokes: st,
        putts: pt,
        green_in_reg: gir,
        wind_direction: wd,
        wind_strength: ws,
      };
      scoresRef.current = new Map(scoresRef.current).set(ch, updatedScore);
      setScores(scoresRef.current);
    }
    // Orchestrator: flush prevHole to IndexedDB + try DB sync
    orchestrator.onHoleSwitch(ch, holeNum);

    setCurrentHole(holeNum);
    try { localStorage.setItem(`golf-last-hole-${roundId}`, String(holeNum)); } catch {}
    setSaveStatus('idle');
    setFailedSave(null);
    setShotsDirty(false);
    setActionAlert(null); // ホール切替時に過去の警告を消す (code-reviewer M3)
    const s = scoresRef.current.get(holeNum);
    setStrokes(s?.strokes ?? null);
    setPutts(s?.putts ?? null);
    setWindDirection(s?.wind_direction ?? null);
    setWindStrength(s?.wind_strength ?? null);
    setGreenInReg(s?.green_in_reg ?? null);
    setObCount(s?.ob_count ?? 0);
    setBunkerCount(s?.bunker_count ?? 0);
    setUserTouched(s !== undefined);
    // 同伴者スコア: 新ホールの入力値に切替（DB保存はしない）
    // allCompanionInputsRef を権威ソースとして読む（未保存の編集中値も保持）
    if (hasCompanions) {
      setCompanionInputs(allCompanionInputsRef.current?.get(holeNum) ?? []);
    }
  }, [roundId, hasCompanions, companions, orchestrator, multiEditing]);


  // スコアラベル
  const getScoreLabel = (s: number, par: number) => {
    const diff = s - par;
    if (diff <= -2) return 'イーグル';
    if (diff === -1) return 'バーディー';
    if (diff === 0) return 'パー';
    if (diff === 1) return 'ボギー';
    if (diff === 2) return 'ダブルボギー';
    if (diff === 3) return 'トリプルボギー';
    return `+${diff}`;
  };

  const getScoreColor = (s: number, par: number) => {
    const diff = s - par;
    if (diff <= -2) return 'text-yellow-400';
    if (diff === -1) return 'text-blue-400';
    if (diff === 0) return 'text-green-400';
    return 'text-red-400';
  };

  const getScoreBgColor = (s: number, par: number) => {
    const diff = s - par;
    if (diff <= -2) return 'bg-yellow-500 text-white';
    if (diff === -1) return 'bg-blue-500 text-white';
    if (diff === 0) return 'bg-green-600 text-white';
    if (diff === 1) return 'bg-red-500 text-white';
    return 'bg-red-700 text-white';
  };

  // 合計スコア計算（入力済みホールのみ）
  const completedHoleNumbers = new Set(scores.keys());
  const totalStrokes = Array.from(scores.values()).reduce((sum, s) => sum + s.strokes, 0);
  const totalPar = holes
    .filter(h => completedHoleNumbers.has(h.hole_number))
    .reduce((sum, h) => sum + h.par, 0);
  const completedHoles = scores.size;

  // 合計パット数
  const totalPutts = Array.from(scores.values()).reduce((sum, s) => sum + (s.putts ?? 0), 0);

  // ホール順序に基づく前後ホール
  const currentIndex = holeOrder.indexOf(currentHole);
  const prevHole = currentIndex > 0 ? holeOrder[currentIndex - 1] : null;
  const nextHole = currentIndex < holeOrder.length - 1 ? holeOrder[currentIndex + 1] : null;

  // 初回表示時にデフォルト値を設定（strokes=Par, putts=2）
  useEffect(() => {
    if (strokes === null) setStrokes(hole.par);
    if (putts === null) setPutts(2);
  }, [currentHole]); // eslint-disable-line react-hooks/exhaustive-deps

  // 同伴者スコアも同様に Par / 2 でデフォルト値を設定（非editMode のみ）
  // null のエントリだけを埋め、既存の入力値は上書きしない
  // companions 変更時も走らせて、ミッドラウンドで追加された同伴者にも即座に反映
  useEffect(() => {
    if (editMode || !hasCompanions) return;
    const all = allCompanionInputsRef.current;
    if (!all) return;
    const current = all.get(currentHole) ?? [];
    let changed = false;
    const next = current.map(i => {
      if (i.strokes === null || i.putts === null) {
        changed = true;
        return { ...i, strokes: i.strokes ?? hole.par, putts: i.putts ?? 2 };
      }
      return i;
    });
    if (changed) {
      all.set(currentHole, next);
      setCompanionInputs(next);
    }
  }, [currentHole, hole.par, editMode, hasCompanions, companions]);

  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* 編集モード: 戻るリンク */}
      {editMode && (
        <Link
          href={`/rounds/${roundId}`}
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          &larr; ラウンド詳細に戻る
        </Link>
      )}

      {/* スティッキーヘッダー: コース名〜ホールナビゲーション */}
      <div className="sticky top-0 z-30 bg-gray-950 -mx-4 px-4 pb-2 space-y-4 border-b border-gray-800">
        {/* ヘッダー: コース名 + 保存状態 */}
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-gray-300 truncate flex-1">{courseName}</p>
          <SyncStatusIndicator
            syncStatus={orchestrator.syncStatus}
            pendingCount={orchestrator.pendingCount}
            isOnline={orchestrator.isOnline}
            isProcessing={orchestrator.isProcessing}
            idbAvailable={idbAvailable}
            isDirty={isDirty}
            compact
          />
        </div>

        {/* ホールナビゲーション */}
        <HoleNavigation
          prevHole={prevHole}
          nextHole={nextHole}
          onNavigate={switchHole}
        >
          <div className="flex items-center gap-2 justify-center">
            <div className="text-center">
              <p className="text-3xl font-bold">Hole {currentHole}</p>
              <p className="text-lg text-gray-300">
                Par {hole.par}
                {hole.distance && ` ・ ${hole.distance}y`}
              </p>
            </div>
            {strokes !== null && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold self-start mt-1 ${getScoreBgColor(strokes, hole.par)}`}>
                {getScoreLabel(strokes, hole.par)}
              </span>
            )}
          </div>
        </HoleNavigation>
      </div>

      {/* 戦略モーダル（背景スクロール防止） */}
      {showStrategyModal && gamePlans.length > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="strategy-modal-title"
          tabIndex={-1}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) setShowStrategyModal(false); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setShowStrategyModal(false); }}
        >
          <div className="mx-4 w-full max-w-sm max-h-[80vh] rounded-xl bg-gray-800 border border-gray-600 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <h2 id="strategy-modal-title" className="text-lg font-bold text-white">戦略アドバイス</h2>
              <button
                type="button"
                autoFocus
                onClick={() => setShowStrategyModal(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                aria-label="閉じる"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <ManagementBand
                gamePlans={gamePlans}
                currentHole={currentHole}
                scores={scores}
                targetScore={targetScore}
                holeOrder={holeOrder}
                scoreLevel={scoreLevel}
                handicap={handicap}
                totalOBCount={totalOBCount}
              />
            </div>
          </div>
        </div>
      )}


      {/* スコアサマリー */}
      {completedHoles > 0 && (
        <div className="rounded-lg bg-gray-800 border border-gray-700 overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-gray-700 py-2">
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-0.5">スコア</p>
              <p className="font-bold tabular-nums">
                <span className="text-xl">{totalStrokes}</span>
                <span className={`ml-1.5 text-sm ${totalStrokes - totalPar > 0 ? 'text-red-400' : totalStrokes - totalPar < 0 ? 'text-blue-400' : 'text-green-400'}`}>
                  ({totalStrokes - totalPar > 0 ? '+' : ''}{totalStrokes - totalPar === 0 ? 'E' : totalStrokes - totalPar})
                </span>
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-0.5">パット</p>
              <p className="text-xl font-bold tabular-nums">{totalPutts}</p>
            </div>
          </div>
        </div>
      )}

      {/* 総打数 + パット数 ステッパー（横並び） */}
      <div className="space-y-2">
        <div className="flex gap-3">
          <div className="flex-1 space-y-1">
            <label className="block text-xs font-bold text-gray-300 text-center">総打数</label>
            <Stepper
              value={strokes}
              min={1}
              max={20}
              fallbackDisplay={String(hole.par)}
              label="打数"
              onChange={(v) => {
                setStrokes(v);
                if (putts !== null && putts > v) setPutts(v);
                setUserTouched(true);
              }}
            />
          </div>
          <div className="w-px bg-gray-700 self-stretch mt-5" />
          <div className="flex-1 space-y-1">
            <label className="block text-xs font-bold text-gray-300 text-center">パット</label>
            <Stepper
              value={putts}
              min={0}
              max={strokes ?? 20}
              fallbackDisplay="2"
              label="パット数"
              onChange={(v) => { setPutts(v); setUserTouched(true); }}
            />
          </div>
        </div>
      </div>

      {/* バンカー・OBカウント */}
      <div className="space-y-2">
        <div className="flex gap-3">
          <div className="flex-1 space-y-1">
            <label className="block text-xs font-bold text-gray-300 text-center">OB</label>
            {editMode ? (
              <Stepper
                value={obCount}
                min={0}
                max={10}
                label="OB"
                onChange={(v) => { setObCount(v); setUserTouched(true); }}
              />
            ) : (
              <p className="text-3xl font-bold text-center tabular-nums">{shotActionsRef.current.getLandingCounts().ob}</p>
            )}
          </div>
          <div className="w-px bg-gray-700 self-stretch mt-5" />
          <div className="flex-1 space-y-1">
            <label className="block text-xs font-bold text-gray-300 text-center">バンカー</label>
            {editMode ? (
              <Stepper
                value={bunkerCount}
                min={0}
                max={10}
                label="バンカー"
                onChange={(v) => { setBunkerCount(v); setUserTouched(true); }}
              />
            ) : (
              <p className="text-3xl font-bold text-center tabular-nums">{shotActionsRef.current.getLandingCounts().bunker}</p>
            )}
          </div>
        </div>
      </div>


      {/* Sprint 6 PR3: 軌跡編集ボタン + inline alert banner */}
      {actionAlert && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-amber-500/60 bg-amber-950/40 px-3 py-2 text-sm text-amber-200"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span className="flex-1">{actionAlert}</span>
          <button
            type="button"
            onClick={() => setActionAlert(null)}
            className="flex-shrink-0 rounded p-0.5 hover:bg-amber-900/40"
            aria-label="通知を閉じる"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={handleMultiEditClick}
        disabled={multiEditLoading}
        className="w-full flex items-center justify-center gap-2 rounded-lg border border-emerald-700 bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-200 text-sm font-medium px-3 py-2 min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="現在ホールの軌跡をまとめて編集"
        aria-busy={multiEditLoading || undefined}
      >
        {multiEditLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            読み込み中…
          </>
        ) : (
          <>
            <Route className="h-4 w-4" aria-hidden="true" />
            軌跡を編集
          </>
        )}
      </button>

      {/* ショット記録 */}
      <div ref={shotRecorderRef}>
      <ShotRecorder
        roundId={roundId}
        holeNumber={currentHole}
        clubs={clubs}
        holeDistance={hole.distance}
        useOrchestratorSave
        onShotsChanged={() => setShotsDirty(true)}
        onPuttDistancePersisted={(payload) => {
          // scoresRef / scores state を同期させて、後続の保存/ホール切替で
          // orchestrator が stale な null でパット距離を上書きしないようにする。
          // syncPuttDistanceIfNeeded は常に holeNumberRef.current（= currentHole）に対して
          // 発火するため、UI state を fallback として使って完全な Score を構築する。
          if (payload.holeNumber !== currentHole) return;
          const existing = scoresRef.current.get(payload.holeNumber);
          const landing = shotActionsRef.current.getLandingCounts();
          const effectiveOb = editMode ? obCount : landing.ob;
          const effectiveBunker = editMode ? bunkerCount : landing.bunker;
          // strokes は validateIntRange(1-20) を通過させるため、par を最終 fallback
          const merged: Score = {
            id: existing?.id ?? '',
            round_id: roundId,
            hole_number: payload.holeNumber,
            strokes: existing?.strokes ?? strokes ?? hole.par,
            putts: existing?.putts ?? putts,
            first_putt_distance: payload.firstPuttDistance,
            first_putt_distance_m: payload.firstPuttDistanceM,
            fairway_hit: existing?.fairway_hit ?? null,
            green_in_reg: existing?.green_in_reg ?? greenInReg,
            tee_shot_lr: existing?.tee_shot_lr ?? null,
            tee_shot_fb: existing?.tee_shot_fb ?? null,
            ob_count: existing?.ob_count ?? effectiveOb,
            bunker_count: existing?.bunker_count ?? effectiveBunker,
            penalty_count: existing?.penalty_count ?? 0,
            wind_direction: existing?.wind_direction ?? windDirection,
            wind_strength: existing?.wind_strength ?? windStrength,
          };
          scoresRef.current = new Map(scoresRef.current).set(payload.holeNumber, merged);
          setScores(scoresRef.current);
        }}
        onShotActionsReady={(actions) => { shotActionsRef.current = actions; }}
      />
      </div>

      {/* 全ホール完了ダイアログ */}
      {showCompleteDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="complete-dialog-title"
          tabIndex={-1}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setShowCompleteDialog(false);
              completeDismissedRef.current = true;
            }
          }}
        >
          <div className="mx-4 w-full max-w-sm rounded-xl bg-gray-800 border border-gray-600 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-400 flex-shrink-0" />
              <h2 id="complete-dialog-title" className="text-xl font-bold text-white">全ホール入力完了</h2>
            </div>
            <p className="text-gray-300">
              {holes.length}ホールすべてのスコアが入力されました。ラウンドを完了しますか？
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowCompleteDialog(false); completeDismissedRef.current = true; }}
                className="flex-1 min-h-[48px] rounded-lg bg-gray-700 px-4 py-3 text-sm font-bold text-gray-300 hover:bg-gray-600 transition-colors"
              >
                続ける
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => router.push(`/play/${roundId}/complete`)}
                className="flex-1 min-h-[48px] rounded-lg bg-green-600 px-4 py-3 text-sm font-bold text-white hover:bg-green-500 transition-colors"
              >
                ラウンド完了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 同伴者スコアモーダル */}
      {hasCompanions && (
        <CompanionScoreModal
          open={showCompanionModal}
          onClose={() => setShowCompanionModal(false)}
          companions={companions}
          holeNumber={currentHole}
          inputs={companionInputs}
          onCommit={handleCompanionCommit}
        />
      )}

      {/* Sprint 6 PR3: マルチショット軌跡編集モーダル */}
      {multiEditing && (
        <MultiShotPositionEditor
          open={true}
          onClose={() => setMultiEditing(null)}
          shots={multiEditing.shots}
          aerialImageUrl={multiEditing.mapData.aerialImageUrl}
          metadata={multiEditing.mapData.metadata}
          areas={multiEditing.mapData.areas}
          saveShotPosition={saveShotPositionForPlay}
          revertShotPosition={revertShotPositionForPlay}
          holeNumber={multiEditing.holeNumber}
        />
      )}

      {/* 右側FABカラム: 上から保存・同伴者・ショット追加 */}
      <div className="fixed right-4 z-40 bottom-[var(--play-nav-height)] mb-3 flex flex-col gap-3 items-end">
        {/* 保存 */}
        <button
          type="button"
          onClick={handleSave}
          disabled={strokes === null || orchestrator.isProcessing}
          className="flex items-center justify-center h-12 w-12 rounded-full shadow-lg bg-green-600 text-white hover:bg-green-500 active:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label={orchestrator.isProcessing ? '保存中...' : '保存'}
        >
          <Save className="h-5 w-5" />
        </button>

        {/* 同伴者スコア */}
        {hasCompanions && !editMode && (
          <button
            type="button"
            onClick={() => setShowCompanionModal(true)}
            className="flex items-center justify-center h-12 w-12 rounded-full shadow-lg bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700 transition-colors"
            aria-label="同伴者スコア入力"
          >
            <Users className="h-5 w-5" />
          </button>
        )}

        {/* 戦略アドバイス */}
        {gamePlans.length > 0 && !editMode && (
          <button
            type="button"
            onClick={() => setShowStrategyModal(true)}
            className="flex items-center justify-center h-12 w-12 rounded-full shadow-lg bg-purple-600 text-white hover:bg-purple-500 active:bg-purple-700 transition-colors"
            aria-label="戦略アドバイス"
          >
            <MessageCircle className="h-5 w-5" />
          </button>
        )}

        {/* ショット追加 */}
        {!editMode && (
          <button
            type="button"
            onClick={() => shotActionsRef.current.addShot()}
            className="flex items-center justify-center h-12 w-12 rounded-full shadow-lg bg-amber-600 text-white hover:bg-amber-500 active:bg-amber-700 transition-colors"
            aria-label="ショットを追加"
          >
            <Plus className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}
