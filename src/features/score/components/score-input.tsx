'use client';

import { useState, useTransition, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { upsertScore } from '@/actions/score';
import { ShotRecorder } from '@/features/score/components/shot-recorder';
import { useToast } from '@/components/ui/toast';
import type { Score } from '@/features/score/types';

interface HoleInfo {
  hole_number: number;
  par: number;
  distance: number | null;
}

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
}

// デフォルトのホール情報（holes テーブルにデータがない場合）
function getDefaultHoles(): HoleInfo[] {
  return Array.from({ length: 18 }, (_, i) => ({
    hole_number: i + 1,
    par: 4,
    distance: null,
  }));
}

export function ScoreInput({ roundId, holes: rawHoles, initialScores, courseName, clubs = [], editMode = false }: ScoreInputProps) {
  const router = useRouter();
  const { showToast } = useToast();
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

  const hole = holes.find(h => h.hole_number === currentHole) ?? { hole_number: currentHole, par: 4, distance: null };
  const score = scores.get(currentHole);

  const [strokes, setStrokes] = useState<number | null>(score?.strokes ?? null);
  const [putts, setPutts] = useState<number | null>(score?.putts ?? null);
  const [greenInReg, setGreenInReg] = useState<boolean | null>(score?.green_in_reg ?? null);
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
    existingId?: string,
  ) => {
    const newScore: Score = {
      id: existingId ?? '',
      round_id: roundId,
      hole_number: holeNum,
      strokes: s,
      putts: p,
      fairway_hit: null,
      green_in_reg: gir,
      tee_shot_lr: null,
      tee_shot_fb: null,
      ob_count: 0,
      bunker_count: 0,
      penalty_count: 0,
    };

    // 楽観的更新
    setScores(prev => {
      previousScoreRef.current = prev.get(holeNum);
      return new Map(prev).set(holeNum, newScore);
    });
    // 保存開始

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
      });
      if (result.error) {
        // 楽観的更新をロールバック
        const prev = previousScoreRef.current;
        if (prev) {
          setScores(m => new Map(m).set(holeNum, prev));
        } else {
          setScores(m => { const next = new Map(m); next.delete(holeNum); return next; });
        }
        showToast('保存に失敗しました', 'error');
      } else {
        showToast('保存しました');
      }
    });
  }, [roundId]);

  const handleSave = useCallback(() => {
    if (strokes === null) return;
    saveHole(currentHole, strokes, putts, greenInReg, score?.id);
  }, [currentHole, strokes, putts, greenInReg, score?.id, saveHole]);

  // スコアMapへの参照（switchHoleでの同期用）
  const scoresRef = useRef(scores);
  useEffect(() => {
    scoresRef.current = scores;
  }, [scores]);

  // ホール切り替え時に未保存データがあれば自動保存
  const switchHole = useCallback((holeNum: number) => {
    if (strokes !== null) {
      saveHole(currentHole, strokes, putts, greenInReg, score?.id);
    }
    setCurrentHole(holeNum);
    const s = scoresRef.current.get(holeNum);
    setStrokes(s?.strokes ?? null);
    setPutts(s?.putts ?? null);
    setGreenInReg(s?.green_in_reg ?? null);
    // ホール切替完了
  }, [strokes, putts, greenInReg, currentHole, score?.id, saveHole]);

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

      {/* ヘッダー: コース名 */}
      <p className="text-sm text-gray-400 truncate">{courseName}</p>

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

      {/* スコアサマリー */}
      {completedHoles > 0 && (
        <div className="flex items-center justify-center gap-6 rounded-lg bg-gray-800 border border-gray-700 py-3">
          <div className="text-center">
            <p className="text-3xl font-bold">{totalStrokes}</p>
            <p className={`text-sm font-bold ${totalStrokes - totalPar > 0 ? 'text-red-400' : totalStrokes - totalPar < 0 ? 'text-blue-400' : 'text-green-400'}`}>
              {totalStrokes - totalPar > 0 ? '+' : ''}{totalStrokes - totalPar === 0 ? 'E' : totalStrokes - totalPar}
            </p>
          </div>
          <div className="h-8 w-px bg-gray-700" />
          <div className="text-center">
            <p className="text-xl font-bold text-gray-300">{totalPutts}</p>
            <p className="text-xs text-gray-500">パット</p>
          </div>
        </div>
      )}

      {/* 総打数 + パット数 ステッパー（縦並び） */}
      <div className="space-y-3">
        {/* 総打数 */}
        <div className="space-y-1">
          <label className="block text-sm font-bold text-gray-300 text-center">総打数</label>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setStrokes(Math.max(1, (strokes ?? hole.par) - 1))}
              className="min-h-[56px] min-w-[56px] flex items-center justify-center rounded-lg bg-gray-800 text-2xl font-bold text-white hover:bg-gray-700 transition-colors"
              aria-label="打数を減らす"
            >
              −
            </button>
            <span className="text-4xl font-bold min-w-[48px] text-center">
              {strokes ?? hole.par}
            </span>
            <button
              onClick={() => setStrokes(Math.min(20, (strokes ?? hole.par) + 1))}
              className="min-h-[56px] min-w-[56px] flex items-center justify-center rounded-lg bg-gray-800 text-2xl font-bold text-white hover:bg-gray-700 transition-colors"
              aria-label="打数を増やす"
            >
              +
            </button>
          </div>
          {strokes !== null && (
            <p className={`text-center text-sm font-bold ${getScoreColor(strokes, hole.par)}`}>
              {getScoreLabel(strokes, hole.par)}
            </p>
          )}
        </div>

        {/* パット数 */}
        <div className="space-y-1">
          <label className="block text-sm font-bold text-gray-300 text-center">パット</label>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setPutts(Math.max(0, (putts ?? 2) - 1))}
              className="min-h-[56px] min-w-[56px] flex items-center justify-center rounded-lg bg-gray-800 text-2xl font-bold text-white hover:bg-gray-700 transition-colors"
              aria-label="パット数を減らす"
            >
              −
            </button>
            <span className="text-4xl font-bold min-w-[48px] text-center">
              {putts ?? 2}
            </span>
            <button
              onClick={() => setPutts(Math.min(10, (putts ?? 2) + 1))}
              className="min-h-[56px] min-w-[56px] flex items-center justify-center rounded-lg bg-gray-800 text-2xl font-bold text-white hover:bg-gray-700 transition-colors"
              aria-label="パット数を増やす"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* ショット記録 */}
      <ShotRecorder
        roundId={roundId}
        holeNumber={currentHole}
        clubs={clubs}
        onRequestAdvice={(situation) => {
          // TODO: 将来的にインラインアドバイス表示。現在はアドバイスページに遷移
          const params = new URLSearchParams({
            hole: String(currentHole),
            lie: situation.lie,
            ...(situation.slopeFB && { slopeFB: situation.slopeFB }),
            ...(situation.slopeLR && { slopeLR: situation.slopeLR }),
          });
          router.push(`/play/${roundId}/advice?${params}`);
        }}
      />

      {/* ホール一覧（ミニスコアカード） */}
      <div className="space-y-2">
        <label className="block text-sm font-bold text-gray-300">スコア一覧</label>
        <MiniScorecardRow holes={holes.slice(0, 9)} scores={scores} currentHole={currentHole} onSwitch={switchHole} getScoreColor={getScoreColor} />
        <MiniScorecardRow holes={holes.slice(9, 18)} scores={scores} currentHole={currentHole} onSwitch={switchHole} getScoreColor={getScoreColor} />
      </div>

      {/* フローティング保存ボタン + ナビバー分のスペーサー */}
      <div className="h-40" />

      {/* フローティング保存ボタン（ナビバーの上に配置） */}
      <div className="fixed bottom-[var(--play-nav-height)] left-0 right-0 z-40 bg-gray-950/90 backdrop-blur-sm border-t border-gray-800 px-4 py-3">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={strokes === null || isPending}
            className="flex-1 min-h-[52px] flex items-center justify-center gap-2 rounded-lg bg-green-600 px-6 py-3 text-lg font-bold text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="h-5 w-5" />
            {isPending ? '保存中...' : '保存'}
          </button>
        </div>
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
