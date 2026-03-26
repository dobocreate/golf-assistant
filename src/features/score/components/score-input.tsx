'use client';

import { useState, useTransition, useCallback, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Save, Check, AlertCircle, Loader2 } from 'lucide-react';
import { upsertScore } from '@/actions/score';
import { ShotRecorder } from '@/features/score/components/shot-recorder';
import { useToast } from '@/components/ui/toast';
import { usePlayRoundOptional } from '@/features/play/context/play-round-context';
import type { Score, HoleInfo } from '@/features/score/types';
import type { WindDirection, WindStrength } from '@/features/round/types';
import { WIND_DIRECTION_LABELS, WIND_STRENGTH_LABELS } from '@/features/round/types';

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

export function ScoreInput({ roundId, holes: rawHoles, initialScores, courseName, clubs = [], editMode = false, startingCourse = 'out', initialHole }: ScoreInputProps) {
  const { showToast } = useToast();
  const holes = rawHoles.length > 0 ? rawHoles : getDefaultHoles();
  const holeOrder = useMemo(() => getHoleOrder(startingCourse), [startingCourse]);
  const playRound = usePlayRoundOptional();

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
  // ユーザーが明示的にスコアを操作したかどうか（デフォルト値の自動保存防止用）
  const [userTouched, setUserTouched] = useState(score !== undefined);
  // penaltyCount / obCount / bunkerCount は廃止（ショット単位の landing に移行）。DB互換のため 0 固定で送信

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
  ) => {
    const existingScore = scoresRef.current.get(holeNum);
    const newScore: Score = {
      id: existingId ?? '',
      round_id: roundId,
      hole_number: holeNum,
      strokes: s,
      putts: p,
      first_putt_distance: existingScore?.first_putt_distance ?? null,
      fairway_hit: null,
      green_in_reg: gir,
      tee_shot_lr: null,
      tee_shot_fb: null,
      ob_count: 0,
      bunker_count: 0,
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
        obCount: 0,
        bunkerCount: 0,
        penaltyCount: 0,
        firstPuttDistance: existingScore?.first_putt_distance ?? null,
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
    if (!hasChanges(currentHole, strokes, putts, greenInReg, windDirection, windStrength)) {
      showToast('変更なし', 'info');
      return;
    }
    saveHole(currentHole, strokes, putts, greenInReg, windDirection, windStrength, score?.id);
  }, [currentHole, strokes, putts, greenInReg, windDirection, windStrength, score?.id, saveHole, hasChanges, showToast]);

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
        {/* 同期状態インジケーター */}
        {saveStatus === 'saving' && (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            保存中
          </span>
        )}
        {saveStatus === 'saved' && (
          <span className="flex items-center gap-1 text-xs text-green-400">
            <Check className="h-3 w-3" />
            保存済み
          </span>
        )}
        {saveStatus === 'error' && (
          <button
            onClick={() => {
              if (failedSave) {
                saveHole(failedSave.holeNum, failedSave.strokes, failedSave.putts, failedSave.gir, failedSave.wd, failedSave.ws, failedSave.existingId);
              }
            }}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            <AlertCircle className="h-3 w-3" />
            保存失敗 - タップで再試行
          </button>
        )}
      </div>

      {/* ホールナビゲーション */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => prevHole !== null && switchHole(prevHole)}
          disabled={prevHole === null}
          className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-lg bg-gray-800 text-white disabled:opacity-30 transition-colors"
          aria-label="前のホール"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        <div className="text-center">
          <p className="text-3xl font-bold">Hole {currentHole}</p>
          <p className="text-lg text-gray-300">
            Par {hole.par}
            {hole.distance && ` ・ ${hole.distance}y`}
          </p>
        </div>

        <button
          onClick={() => nextHole !== null && switchHole(nextHole)}
          disabled={nextHole === null}
          className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-lg bg-gray-800 text-white disabled:opacity-30 transition-colors"
          aria-label="次のホール"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      {/* 風（ホール単位） */}
      <div className="flex gap-2">
        <div className="flex-1">
          <p className="text-xs text-gray-400 mb-1">風向き</p>
          <div className="grid grid-cols-4 gap-1">
            {(Object.entries(WIND_DIRECTION_LABELS) as [WindDirection, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => { setWindDirection(windDirection === key ? null : key); setUserTouched(true); }}
                className={`min-h-[40px] rounded-lg text-xs font-bold transition-colors ${
                  windDirection === key ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1">
          <p className="text-xs text-gray-400 mb-1">風の強さ</p>
          <div className="grid grid-cols-2 gap-1">
            {(Object.entries(WIND_STRENGTH_LABELS) as [WindStrength, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => { setWindStrength(windStrength === key ? null : key); setUserTouched(true); }}
                className={`min-h-[40px] rounded-lg text-xs font-bold transition-colors ${
                  windStrength === key ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* スコアサマリー */}
      {completedHoles > 0 && (
        <div className="rounded-lg bg-gray-800 border border-gray-700 overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-gray-700 py-3">
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-1">スコア</p>
              <p className="text-2xl font-bold tabular-nums">{totalStrokes}</p>
              <p className={`text-sm font-bold ${totalStrokes - totalPar > 0 ? 'text-red-400' : totalStrokes - totalPar < 0 ? 'text-blue-400' : 'text-green-400'}`}>
                {totalStrokes - totalPar > 0 ? '+' : ''}{totalStrokes - totalPar === 0 ? 'E' : totalStrokes - totalPar}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-1">パット</p>
              <p className="text-2xl font-bold tabular-nums">{totalPutts}</p>
            </div>
          </div>
        </div>
      )}

      {/* 総打数 + パット数 ステッパー（横並び） */}
      <div className="space-y-2">
        <div className="flex gap-3">
          {/* 総打数 */}
          <div className="flex-1 space-y-1">
            <label className="block text-xs font-bold text-gray-300 text-center">総打数</label>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => {
                  const newStrokes = Math.max(1, (strokes ?? hole.par) - 1);
                  setStrokes(newStrokes);
                  if (putts !== null && putts > newStrokes) setPutts(newStrokes);
                  setUserTouched(true);
                }}
                className="min-h-[52px] min-w-[48px] flex items-center justify-center rounded-lg bg-gray-800 text-xl font-bold text-white hover:bg-gray-700 transition-colors"
                aria-label="打数を減らす"
              >
                −
              </button>
              <span className="text-3xl font-bold min-w-[40px] text-center">
                {strokes ?? hole.par}
              </span>
              <button
                onClick={() => { setStrokes(Math.min(20, (strokes ?? hole.par) + 1)); setUserTouched(true); }}
                className="min-h-[52px] min-w-[48px] flex items-center justify-center rounded-lg bg-gray-800 text-xl font-bold text-white hover:bg-gray-700 transition-colors"
                aria-label="打数を増やす"
              >
                +
              </button>
            </div>
          </div>

          {/* 区切り */}
          <div className="w-px bg-gray-700 self-stretch mt-5" />

          {/* パット数 */}
          <div className="flex-1 space-y-1">
            <label className="block text-xs font-bold text-gray-300 text-center">パット</label>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => { setPutts(Math.max(0, (putts ?? 2) - 1)); setUserTouched(true); }}
                className="min-h-[52px] min-w-[48px] flex items-center justify-center rounded-lg bg-gray-800 text-xl font-bold text-white hover:bg-gray-700 transition-colors"
                aria-label="パット数を減らす"
              >
                −
              </button>
              <span className="text-3xl font-bold min-w-[40px] text-center">
                {putts ?? 2}
              </span>
              <button
                onClick={() => { setPutts(Math.min(strokes ?? 20, (putts ?? 2) + 1)); setUserTouched(true); }}
                className="min-h-[52px] min-w-[48px] flex items-center justify-center rounded-lg bg-gray-800 text-xl font-bold text-white hover:bg-gray-700 transition-colors"
                aria-label="パット数を増やす"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* スコアラベル */}
        {strokes !== null && (
          <p className={`text-center text-sm font-bold ${getScoreColor(strokes, hole.par)}`}>
            {getScoreLabel(strokes, hole.par)}
          </p>
        )}
      </div>

      {/* ショット記録 */}
      <ShotRecorder
        roundId={roundId}
        holeNumber={currentHole}
        clubs={clubs}
      />

      {/* ナビバー + フローティングボタン分のスペーサー */}
      <div className="h-32" />

      {/* フローティング保存ボタン（ナビバーの上・右寄せ） */}
      <div className="fixed bottom-[var(--play-nav-height)] right-4 z-40 mb-3">
        <button
          onClick={handleSave}
          disabled={strokes === null || isPending}
          className="min-h-[48px] flex items-center justify-center gap-2 rounded-full bg-green-600 px-5 py-3 text-sm font-bold text-white shadow-lg hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Save className="h-4 w-4" />
          {isPending ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  );
}
