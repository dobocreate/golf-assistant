'use client';

import { useState, useTransition, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { upsertScore } from '@/actions/score';
import type { Score } from '@/features/score/types';

interface HoleInfo {
  hole_number: number;
  par: number;
  distance: number | null;
}

interface ScoreInputProps {
  roundId: string;
  holes: HoleInfo[];
  initialScores: Score[];
  courseName: string;
}

// デフォルトのホール情報（holes テーブルにデータがない場合）
function getDefaultHoles(): HoleInfo[] {
  return Array.from({ length: 18 }, (_, i) => ({
    hole_number: i + 1,
    par: 4,
    distance: null,
  }));
}

export function ScoreInput({ roundId, holes: rawHoles, initialScores, courseName }: ScoreInputProps) {
  const holes = rawHoles.length > 0 ? rawHoles : getDefaultHoles();
  const [currentHole, setCurrentHole] = useState(1);
  const [scores, setScores] = useState<Map<number, Score>>(() => {
    const map = new Map<number, Score>();
    for (const s of initialScores) {
      map.set(s.hole_number, s);
    }
    return map;
  });
  const [isPending, startTransition] = useTransition();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const hole = holes.find(h => h.hole_number === currentHole) ?? { hole_number: currentHole, par: 4, distance: null };
  const score = scores.get(currentHole);

  const [strokes, setStrokes] = useState<number | null>(score?.strokes ?? null);
  const [putts, setPutts] = useState<number | null>(score?.putts ?? null);
  const [fairwayHit, setFairwayHit] = useState<boolean | null>(score?.fairway_hit ?? null);
  const [greenInReg, setGreenInReg] = useState<boolean | null>(score?.green_in_reg ?? null);

  // 直前のスコアを保持（ロールバック用）
  const previousScoreRef = useRef<Score | undefined>(undefined);

  const saveHole = useCallback((
    holeNum: number,
    s: number,
    p: number | null,
    fw: boolean | null,
    gir: boolean | null,
    existingId?: string,
  ) => {
    const newScore: Score = {
      id: existingId ?? '',
      round_id: roundId,
      hole_number: holeNum,
      strokes: s,
      putts: p,
      fairway_hit: fw,
      green_in_reg: gir,
    };

    // 楽観的更新
    setScores(prev => {
      previousScoreRef.current = prev.get(holeNum);
      return new Map(prev).set(holeNum, newScore);
    });
    setSaveStatus('saving');

    startTransition(async () => {
      const result = await upsertScore({
        roundId,
        holeNumber: holeNum,
        strokes: s,
        putts: p,
        fairwayHit: fw,
        greenInReg: gir,
      });
      if (result.error) {
        // 楽観的更新をロールバック
        const prev = previousScoreRef.current;
        if (prev) {
          setScores(m => new Map(m).set(holeNum, prev));
        } else {
          setScores(m => { const next = new Map(m); next.delete(holeNum); return next; });
        }
        setSaveStatus('error');
      } else {
        setSaveStatus('saved');
      }
    });
  }, [roundId]);

  const handleSave = useCallback(() => {
    if (strokes === null) return;
    saveHole(currentHole, strokes, putts, fairwayHit, greenInReg, score?.id);
  }, [currentHole, strokes, putts, fairwayHit, greenInReg, score?.id, saveHole]);

  // スコアMapへの参照（switchHoleでの同期用）
  const scoresRef = useRef(scores);
  scoresRef.current = scores;

  // ホール切り替え時に未保存データがあれば自動保存
  const switchHole = useCallback((holeNum: number) => {
    if (strokes !== null) {
      saveHole(currentHole, strokes, putts, fairwayHit, greenInReg, score?.id);
    }
    setCurrentHole(holeNum);
    const s = scoresRef.current.get(holeNum);
    setStrokes(s?.strokes ?? null);
    setPutts(s?.putts ?? null);
    setFairwayHit(s?.fairway_hit ?? null);
    setGreenInReg(s?.green_in_reg ?? null);
    setSaveStatus('idle');
  }, [strokes, putts, fairwayHit, greenInReg, currentHole, score?.id, saveHole]);

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

  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* ヘッダー: コース名 + 合計 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400 truncate">{courseName}</p>
        {completedHoles > 0 && (
          <p className="text-sm text-gray-400">
            {totalStrokes} ({totalStrokes - totalPar >= 0 ? '+' : ''}{totalStrokes - totalPar}) / {completedHoles}H
          </p>
        )}
      </div>

      {/* ホールナビゲーション */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => currentHole > 1 && switchHole(currentHole - 1)}
          disabled={currentHole <= 1}
          className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-lg bg-gray-800 text-white disabled:opacity-30 transition-colors"
          aria-label="前のホール"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        <div className="text-center">
          <p className="text-3xl font-bold">Hole {currentHole}</p>
          <p className="text-lg text-gray-400">
            Par {hole.par}
            {hole.distance && ` ・ ${hole.distance}y`}
          </p>
        </div>

        <button
          onClick={() => currentHole < 18 && switchHole(currentHole + 1)}
          disabled={currentHole >= 18}
          className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-lg bg-gray-800 text-white disabled:opacity-30 transition-colors"
          aria-label="次のホール"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      {/* 打数入力 */}
      <div className="space-y-2">
        <label className="block text-sm font-bold text-gray-300">打数</label>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }, (_, i) => hole.par - 2 + i).filter(v => v >= 1).map(v => (
            <button
              key={v}
              onClick={() => setStrokes(v)}
              className={`min-h-[48px] rounded-lg text-lg font-bold transition-colors ${
                strokes === v
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        {strokes !== null && (
          <p className={`text-center text-sm font-bold ${getScoreColor(strokes, hole.par)}`}>
            {getScoreLabel(strokes, hole.par)}
          </p>
        )}
      </div>

      {/* パット数入力 */}
      <div className="space-y-2">
        <label className="block text-sm font-bold text-gray-300">パット数</label>
        <div className="grid grid-cols-5 gap-2">
          {[0, 1, 2, 3, 4].map(v => (
            <button
              key={v}
              onClick={() => setPutts(v)}
              className={`min-h-[48px] rounded-lg text-lg font-bold transition-colors ${
                putts === v
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* FWキープ / パーオン */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm font-bold text-gray-300">FWキープ</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setFairwayHit(true)}
              className={`min-h-[48px] rounded-lg text-lg font-bold transition-colors ${
                fairwayHit === true
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
              }`}
            >
              ○
            </button>
            <button
              onClick={() => setFairwayHit(false)}
              className={`min-h-[48px] rounded-lg text-lg font-bold transition-colors ${
                fairwayHit === false
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
              }`}
            >
              ✕
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-bold text-gray-300">パーオン</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setGreenInReg(true)}
              className={`min-h-[48px] rounded-lg text-lg font-bold transition-colors ${
                greenInReg === true
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
              }`}
            >
              ○
            </button>
            <button
              onClick={() => setGreenInReg(false)}
              className={`min-h-[48px] rounded-lg text-lg font-bold transition-colors ${
                greenInReg === false
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
              }`}
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      {/* 保存ボタン */}
      <button
        onClick={handleSave}
        disabled={strokes === null || isPending}
        className="w-full min-h-[56px] flex items-center justify-center gap-2 rounded-lg bg-green-600 px-6 py-4 text-xl font-bold text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Save className="h-5 w-5" />
        {isPending ? '保存中...' : '保存'}
      </button>

      {saveStatus === 'saved' && (
        <p className="text-center text-sm text-green-400">保存しました</p>
      )}
      {saveStatus === 'error' && (
        <p className="text-center text-sm text-red-400">保存に失敗しました</p>
      )}

      {/* ホール一覧（ミニスコアカード） */}
      <div className="space-y-2">
        <label className="block text-sm font-bold text-gray-300">スコア一覧</label>
        <MiniScorecardRow holes={holes.slice(0, 9)} scores={scores} currentHole={currentHole} onSwitch={switchHole} getScoreColor={getScoreColor} />
        <MiniScorecardRow holes={holes.slice(9, 18)} scores={scores} currentHole={currentHole} onSwitch={switchHole} getScoreColor={getScoreColor} />
      </div>
    </div>
  );
}

function MiniScorecardRow({
  holes,
  scores,
  currentHole,
  onSwitch,
  getScoreColor,
}: {
  holes: HoleInfo[];
  scores: Map<number, Score>;
  currentHole: number;
  onSwitch: (holeNum: number) => void;
  getScoreColor: (s: number, par: number) => string;
}) {
  return (
    <div className="grid grid-cols-9 gap-1">
      {holes.map(h => {
        const s = scores.get(h.hole_number);
        return (
          <button
            key={h.hole_number}
            onClick={() => onSwitch(h.hole_number)}
            className={`min-h-[48px] rounded text-xs font-bold transition-colors ${
              currentHole === h.hole_number
                ? 'bg-green-600 text-white'
                : s
                  ? 'bg-gray-700 text-white'
                  : 'bg-gray-800 text-gray-500'
            }`}
          >
            <div>{h.hole_number}</div>
            {s && <div className={getScoreColor(s.strokes, h.par)}>{s.strokes}</div>}
          </button>
        );
      })}
    </div>
  );
}
