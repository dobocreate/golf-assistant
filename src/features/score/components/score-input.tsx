'use client';

import { useState, useTransition, useCallback, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Save, CheckCircle } from 'lucide-react';
import { SaveStatusIndicator } from '@/components/ui/save-status-indicator';
import { HoleNavigation } from '@/components/ui/hole-navigation';
import { Stepper } from '@/components/ui/stepper';
import { ToggleButtonGrid, type ToggleOption } from '@/components/ui/toggle-button-grid';
import { upsertScore } from '@/actions/score';
import { ShotRecorder } from '@/features/score/components/shot-recorder';
import { useToast } from '@/components/ui/toast';
import { usePlayRoundOptional } from '@/features/play/context/play-round-context';
import type { Score, HoleInfo } from '@/features/score/types';
import type { WindDirection, WindStrength } from '@/features/round/types';
import { WIND_DIRECTION_LABELS, WIND_STRENGTH_LABELS } from '@/features/round/types';
import { ManagementBand, type ManagementBandContext } from '@/features/score/components/management-band';
import type { GamePlan } from '@/features/game-plan/types';

const WIND_DIR_OPTIONS: ToggleOption<WindDirection>[] =
  (Object.entries(WIND_DIRECTION_LABELS) as [WindDirection, string][]).map(([value, label]) => ({ value, label }));
const WIND_STR_OPTIONS: ToggleOption<WindStrength>[] =
  (Object.entries(WIND_STRENGTH_LABELS) as [WindStrength, string][]).map(([value, label]) => ({ value, label }));

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

export function ScoreInput({ roundId, holes: rawHoles, initialScores, courseName, clubs = [], editMode = false, startingCourse = 'out', initialHole, weather = null, gamePlans = [], targetScore = null, scoreLevel = null, handicap = null }: ScoreInputProps) {
  const { showToast } = useToast();
  const holes = rawHoles.length > 0 ? rawHoles : getDefaultHoles();
  const holeOrder = useMemo(() => getHoleOrder(startingCourse), [startingCourse]);
  const playRound = usePlayRoundOptional();
  const shotRecorderRef = useRef<HTMLDivElement>(null);
  const [gamePlanContextForAdvice] = useState<ManagementBandContext | null>(null);
  const shotActionsRef = useRef<{ saveCurrentHole: () => void; hasPendingShots: () => boolean; getLandingCounts: () => { ob: number; bunker: number } }>({ saveCurrentHole: () => {}, hasPendingShots: () => false, getLandingCounts: () => ({ ob: 0, bunker: 0 }) });

  // 初期ホール決定: searchParams > localStorage > holeOrder[0]
  const [currentHole, setCurrentHole] = useState(() => {
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
  });
  // PlayRoundContext の currentHole をローカルステートと同期（ローカル→Context 一方向）
  useEffect(() => {
    playRound?.setCurrentHole(currentHole);
  }, [playRound, currentHole]);
  const [scores, setScores] = useState<Map<number, Score>>(() => {
    const map = new Map<number, Score>();
    for (const s of initialScores) {
      map.set(s.hole_number, s);
    }
    return map;
  });
  const totalOBCount = useMemo(
    () => Array.from(scores.values()).reduce((sum, s) => sum + (s.ob_count ?? 0), 0),
    [scores],
  );
  const [isPending, startTransition] = useTransition();

  // 保存状態: 'idle' | 'saving' | 'saved' | 'error'
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // アンマウント時にタイマーをクリーンアップ + 未保存スコアをfire-and-forget保存
  const roundIdRef = useRef(roundId);
  useEffect(() => { roundIdRef.current = roundId; }, [roundId]);

  useEffect(() => {
    return () => {
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
      // アンマウント時: 未保存スコアをstate更新なしで保存
      const { strokes, putts, greenInReg, windDirection: wd, windStrength: ws, currentHole, scoreId, userTouched } = currentInputRef.current;
      if (!userTouched || strokes === null) return;
      const existing = scoresRef.current.get(currentHole);
      if (!existing || existing.strokes !== strokes || existing.putts !== putts || existing.green_in_reg !== greenInReg || existing.wind_direction !== wd || existing.wind_strength !== ws) {
        upsertScore({
          roundId: roundIdRef.current,
          holeNumber: currentHole,
          strokes,
          putts,
          fairwayHit: null,
          greenInReg,
          teeShotLr: null,
          teeShotFb: null,
          obCount: 0,
          bunkerCount: 0,
          penaltyCount: 0,
          firstPuttDistance: existing?.first_putt_distance ?? null,
          firstPuttDistanceM: existing?.first_putt_distance_m ?? null,
          windDirection: wd,
          windStrength: ws,
        }).catch(() => {});
      }
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

  const saveHole = useCallback((
    holeNum: number,
    s: number,
    p: number | null,
    gir: boolean | null,
    wd: WindDirection | null,
    ws: WindStrength | null,
    existingId?: string,
    overrideOb?: number,
    overrideBunker?: number,
  ) => {
    // プレー中: ショット記録から自動集計、編集モード: 手動値を使用
    const landing = shotActionsRef.current.getLandingCounts();
    const finalOb = overrideOb ?? landing.ob;
    const finalBunker = overrideBunker ?? landing.bunker;

    const existingScore = scoresRef.current.get(holeNum);
    const newScore: Score = {
      id: existingId ?? '',
      round_id: roundId,
      hole_number: holeNum,
      strokes: s,
      putts: p,
      first_putt_distance: existingScore?.first_putt_distance ?? null,
      first_putt_distance_m: existingScore?.first_putt_distance_m ?? null,
      fairway_hit: null,
      green_in_reg: gir,
      tee_shot_lr: null,
      tee_shot_fb: null,
      ob_count: finalOb,
      bunker_count: finalBunker,
      penalty_count: 0,
      wind_direction: wd,
      wind_strength: ws,
    };

    // 楽観的更新
    setScores(prev => {
      previousScoreRef.current = prev.get(holeNum);
      return new Map(prev).set(holeNum, newScore);
    });
    // 保存状態を更新
    setSaveStatus('saving');
    setFailedSave(null);
    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);

    startTransition(async () => {
      const result = await upsertScore({
        roundId,
        holeNumber: holeNum,
        strokes: s,
        putts: p,
        fairwayHit: null,
        greenInReg: gir,
        teeShotLr: null,
        teeShotFb: null,
        obCount: finalOb,
        bunkerCount: finalBunker,
        penaltyCount: 0,
        firstPuttDistance: existingScore?.first_putt_distance ?? null,
        firstPuttDistanceM: existingScore?.first_putt_distance_m ?? null,
        windDirection: wd,
        windStrength: ws,
      });
      if (result.error) {
        const prev = previousScoreRef.current;
        if (prev) {
          setScores(m => new Map(m).set(holeNum, prev));
        } else {
          setScores(m => { const next = new Map(m); next.delete(holeNum); return next; });
        }
        setSaveStatus('error');
        setFailedSave({ holeNum, strokes: s, putts: p, gir, wd, ws, existingId });
      } else {
        setSaveStatus('saved');
        setFailedSave(null);
        saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000);
      }
    });
  }, [roundId]);

  // 変更検知: 現在の入力値とscores Mapの保存済み値を比較
  const hasChanges = useCallback((holeNum: number, s: number | null, p: number | null, gir: boolean | null, wd: WindDirection | null, ws: WindStrength | null): boolean => {
    if (s === null) return false;
    const saved = scoresRef.current.get(holeNum);
    if (!saved) return true;
    return saved.strokes !== s || saved.putts !== p || saved.green_in_reg !== gir || saved.wind_direction !== wd || saved.wind_strength !== ws;
  }, []);

  const handleSave = useCallback(() => {
    if (strokes === null) return;
    const scoreChanged = hasChanges(currentHole, strokes, putts, greenInReg, windDirection, windStrength);
    const shotsChanged = shotActionsRef.current.hasPendingShots();
    // バンカー/OBの変更も検知
    const existingScore = scoresRef.current.get(currentHole);
    const countsChanged = (existingScore?.ob_count ?? 0) !== obCount || (existingScore?.bunker_count ?? 0) !== bunkerCount;
    if (!scoreChanged && !shotsChanged && !countsChanged) {
      showToast('変更なし', 'info');
      return;
    }
    if (scoreChanged || countsChanged) {
      saveHole(currentHole, strokes, putts, greenInReg, windDirection, windStrength, score?.id, editMode ? obCount : undefined, editMode ? bunkerCount : undefined);
    }
    if (shotsChanged) {
      shotActionsRef.current.saveCurrentHole();
    }
    if (!scoreChanged && !countsChanged && shotsChanged) {
      showToast('ショット記録を保存しました', 'success');
    }
  }, [currentHole, strokes, putts, greenInReg, windDirection, windStrength, obCount, bunkerCount, score?.id, editMode, saveHole, hasChanges, showToast]);

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

  // ホール切り替え時に未保存データがあれば自動保存（ユーザーが操作済みの場合のみ）
  const switchHole = useCallback((holeNum: number) => {
    const { strokes: st, putts: pt, greenInReg: gir, windDirection: wd, windStrength: ws, currentHole: ch, scoreId, userTouched: touched } = currentInputRef.current;
    if (touched && st !== null && hasChanges(ch, st, pt, gir, wd, ws)) {
      saveHole(ch, st, pt, gir, wd, ws, scoreId);
    }
    setCurrentHole(holeNum);
    try { localStorage.setItem(`golf-last-hole-${roundId}`, String(holeNum)); } catch {}
    setSaveStatus('idle');
    setFailedSave(null);
    const s = scoresRef.current.get(holeNum);
    setStrokes(s?.strokes ?? null);
    setPutts(s?.putts ?? null);
    setWindDirection(s?.wind_direction ?? null);
    setWindStrength(s?.wind_strength ?? null);
    setGreenInReg(s?.green_in_reg ?? null);
    setObCount(s?.ob_count ?? 0);
    setBunkerCount(s?.bunker_count ?? 0);
    setUserTouched(s !== undefined);
  }, [saveHole, hasChanges, roundId]);


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

      {/* ヘッダー: コース名 + 保存状態 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-300 truncate flex-1">{courseName}</p>
        <SaveStatusIndicator
          status={saveStatus}
          onRetry={failedSave ? () => saveHole(failedSave.holeNum, failedSave.strokes, failedSave.putts, failedSave.gir, failedSave.wd, failedSave.ws, failedSave.existingId) : undefined}
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

      {/* マネジメントバンド */}
      {gamePlans.length > 0 && (
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

      {/* 風（ホール単位） */}
      <div className="flex gap-2">
        <div className="flex-1">
          <p className="text-xs text-gray-400 mb-1">風向き</p>
          <ToggleButtonGrid
            options={WIND_DIR_OPTIONS}
            value={windDirection}
            onChange={(v) => { setWindDirection(v); setUserTouched(true); }}
            columns={2}
            className="gap-1"
          />
        </div>
        <div className="flex-1">
          <p className="text-xs text-gray-400 mb-1">風の強さ</p>
          <ToggleButtonGrid
            options={WIND_STR_OPTIONS}
            value={windStrength}
            onChange={(v) => { setWindStrength(v); setUserTouched(true); }}
            columns={2}
            className="gap-1"
          />
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
        onShotActionsReady={(actions) => { shotActionsRef.current = actions; }}
      />
      </div>

      {/* ナビバー + フローティングボタン分のスペーサー */}
      <div className="h-32" />

      {/* フローティング保存ボタン（ナビバーの上・右寄せ） */}
      <div className="fixed bottom-[var(--play-nav-height)] right-4 z-40 mb-3 flex gap-2">
        <button
          onClick={handleSave}
          disabled={strokes === null || isPending}
          className="min-h-[48px] flex items-center justify-center gap-2 rounded-lg bg-green-600 px-5 py-3 text-sm font-bold text-white shadow-lg hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Save className="h-4 w-4" />
          {isPending ? '保存中...' : '保存'}
        </button>
        {editMode && (
          <Link
            href={`/rounds/${roundId}`}
            className="min-h-[48px] flex items-center justify-center gap-2 rounded-lg bg-green-600 px-5 py-3 text-sm font-bold text-white shadow-lg hover:bg-green-500 transition-colors"
          >
            <CheckCircle className="h-4 w-4" />
            完了
          </Link>
        )}
      </div>
    </div>
  );
}
