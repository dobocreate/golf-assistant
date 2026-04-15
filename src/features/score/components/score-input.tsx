'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Save, CheckCircle, Users, Plus, MessageCircle, X } from 'lucide-react';
import { SaveStatusIndicator } from '@/components/ui/save-status-indicator';
import { SyncStatusIndicator } from '@/features/score/components/sync-status-indicator';
import { HoleNavigation } from '@/components/ui/hole-navigation';
import { Stepper } from '@/components/ui/stepper';
import { ShotRecorder } from '@/features/score/components/shot-recorder';
import { useToast } from '@/components/ui/toast';
import { usePlayRoundOptional } from '@/features/play/context/play-round-context';
import type { Score, HoleInfo, Companion, CompanionScore } from '@/features/score/types';
import { CompanionScoreModal, getCompanionInputsForHole, type CompanionHoleInput } from '@/features/score/components/companion-score-modal';
import type { WindDirection, WindStrength } from '@/features/round/types';
import { ManagementBand, type ManagementBandContext } from '@/features/score/components/management-band';
import type { GamePlan } from '@/features/game-plan/types';
import { useSaveOrchestrator } from '@/features/score/hooks/use-save-orchestrator';
import { checkIndexedDBAvailability, type LocalScore, type LocalShot } from '@/lib/offline-store';
import type { replaceShotsForHole } from '@/actions/shot';


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
  weather?: string | null;
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

export function ScoreInput({ roundId, holes: rawHoles, initialScores, courseName, clubs = [], editMode = false, startingCourse = 'out', initialHole, weather = null, gamePlans = [], targetScore = null, scoreLevel = null, handicap = null, companions = [], initialCompanionScores = [] }: ScoreInputProps) {
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

  const handleCompanionInputChange = useCallback((companionId: string, field: 'strokes' | 'putts', value: number | null) => {
    const all = allCompanionInputsRef.current;
    if (!all) return;
    const current = all.get(currentHole) ?? [];
    const next = current.map(i =>
      i.companionId === companionId ? { ...i, [field]: value } : i,
    );
    // 同期的にリファレンスを更新してから React ステートを更新
    // （updater 関数内の副作用を避け、直後の orchestrator 実行で最新値を参照可能にする）
    all.set(currentHole, next);
    setCompanionInputs(next);
  }, [currentHole]);

  const shotRecorderRef = useRef<HTMLDivElement>(null);
  const [gamePlanContextForAdvice] = useState<ManagementBandContext | null>(null);
  const shotActionsRef = useRef<{
    saveCurrentHole: () => void;
    hasPendingShots: () => boolean;
    getLandingCounts: () => { ob: number; bunker: number };
    addShot: () => void;
    getShotsForHoleLocal?: (hole: number) => LocalShot[] | null;
    buildShotSyncPayload?: (hole: number) => Parameters<typeof replaceShotsForHole>[0] | null;
  }>({ saveCurrentHole: () => {}, hasPendingShots: () => false, getLandingCounts: () => ({ ob: 0, bunker: 0 }), addShot: () => {} });

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
    return saved.strokes !== strokes
      || saved.putts !== putts
      || saved.green_in_reg !== greenInReg
      || saved.wind_direction !== windDirection
      || saved.wind_strength !== windStrength
      || (saved.ob_count ?? 0) !== obCount
      || (saved.bunker_count ?? 0) !== bunkerCount;
  }, [scores, currentHole, strokes, putts, greenInReg, windDirection, windStrength, obCount, bunkerCount, shotsDirty]);

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
      ob_count: landing.ob,
      bunker_count: landing.bunker,
    });
    setScores(scoresRef.current);
  }, [currentHole, strokes, putts, greenInReg, windDirection, windStrength, obCount, bunkerCount, roundId, orchestrator]);

  // スコアMapへの参照（switchHoleでの同期用）
  const scoresRef = useRef(scores);
  useEffect(() => {
    scoresRef.current = scores;
  }, [scores]);

  // 現在の入力値を ref で保持（switchHole の依存配列を最小化するため）
  const currentInputRef = useRef({ strokes, putts, greenInReg, windDirection, windStrength, currentHole, scoreId: score?.id, userTouched });
  useEffect(() => {
    currentInputRef.current = { strokes, putts, greenInReg, windDirection, windStrength, currentHole, scoreId: score?.id, userTouched };
  }, [strokes, putts, greenInReg, windDirection, windStrength, currentHole, score?.id, userTouched]);

  // --- Register orchestrator score callbacks ---
  useEffect(() => {
    orchestrator.registerScoreCallbacks({
      collectData: (hole: number): Partial<LocalScore> | null => {
        const { strokes: st, putts: pt, greenInReg: gir, windDirection: wd, windStrength: ws, currentHole: ch, userTouched: touched } = currentInputRef.current;
        // Only collect data for the current hole being edited
        if (hole === ch && touched && st !== null) {
          const existing = scoresRef.current.get(hole);
          const landing = shotActionsRef.current.getLandingCounts();
          return {
            id: existing?.id ?? '',
            round_id: roundIdRef.current,
            hole_number: hole,
            strokes: st,
            putts: pt,
            green_in_reg: gir,
            wind_direction: wd,
            wind_strength: ws,
            ob_count: landing.ob,
            bunker_count: landing.bunker,
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
        const { strokes: st, putts: pt, greenInReg: gir, windDirection: wd, windStrength: ws, currentHole: ch, userTouched: touched } = currentInputRef.current;
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
        return {
          roundId: roundIdRef.current,
          holeNumber: hole,
          strokes: s,
          putts: p,
          fairwayHit: null,
          greenInReg: g,
          teeShotLr: null,
          teeShotFb: null,
          obCount: landing.ob,
          bunkerCount: landing.bunker,
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
  }, [roundId, hasCompanions, companions, orchestrator]);


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


      {/* ショット記録 */}
      <div ref={shotRecorderRef}>
      <ShotRecorder
        roundId={roundId}
        holeNumber={currentHole}
        clubs={clubs}
        windDirection={windDirection}
        windStrength={windStrength}
        weather={weather}
        gamePlanContext={
          gamePlanContextForAdvice
            ? [
                gamePlanContextForAdvice.alertText && `【弱点アラート】${gamePlanContextForAdvice.alertText}`,
                gamePlanContextForAdvice.planText && `【ゲームプラン】${gamePlanContextForAdvice.planText}`,
                gamePlanContextForAdvice.toneLabel && `【戦略トーン】${gamePlanContextForAdvice.toneLabel}`,
              ].filter(Boolean).join('\n') || null
            : null
        }
        holeDistance={hole.distance}
        useOrchestratorSave
        onShotsChanged={() => setShotsDirty(true)}
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
          onInputChange={handleCompanionInputChange}
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
