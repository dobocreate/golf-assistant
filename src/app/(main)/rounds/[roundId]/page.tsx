import { getRoundWithCourse } from '@/actions/round';
import { getScoresWithHoles } from '@/actions/score';
import { getMemos } from '@/actions/memo';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Flag, Pencil } from 'lucide-react';
import { CopyScoreButton } from './copy-score-button';
import { ReviewNoteSection } from './review-note-section';
import { PracticeSuggestionSection } from './practice-suggestion-section';
import { getPracticeSuggestion } from '@/actions/round';
import { FIRST_PUTT_DISTANCE_LABELS } from '@/features/score/types';
import type { FirstPuttDistance } from '@/features/score/types';
import { distanceToCategory } from '@/features/score/types';

export default async function RoundReviewPage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/auth/login');

  const { roundId } = await params;
  const round = await getRoundWithCourse(roundId);
  if (!round) notFound();

  const [data, memos, practiceSuggestion] = await Promise.all([
    getScoresWithHoles(roundId),
    getMemos(roundId),
    round.status === 'completed' ? getPracticeSuggestion(roundId) : Promise.resolve(null),
  ]);

  const holes = data?.holes ?? [];
  const scores = data?.scores ?? [];
  const scoreMap = new Map(scores.map(s => [s.hole_number, s]));

  const totalStrokes = scores.reduce((sum, s) => sum + s.strokes, 0);
  const totalPar = holes.reduce((sum, h) => sum + (scoreMap.has(h.hole_number) ? h.par : 0), 0);
  const completedHoles = scores.length;

  const fwHits = scores.filter(s => s.fairway_hit === true).length;
  const fwTotal = scores.filter(s => s.fairway_hit !== null).length;
  const girHits = scores.filter(s => s.green_in_reg === true).length;
  const girTotal = scores.filter(s => s.green_in_reg !== null).length;
  const totalPutts = scores.reduce((sum, s) => sum + (s.putts ?? 0), 0);
  const puttsCount = scores.filter(s => s.putts !== null).length;
  // ファーストパット距離の集計（数値データ優先）
  const puttDistScores = scores.filter(s => s.first_putt_distance_m != null || s.first_putt_distance !== null);
  const puttDistCounts = puttDistScores.reduce((acc, s) => {
    const d: FirstPuttDistance = s.first_putt_distance_m != null
      ? distanceToCategory(s.first_putt_distance_m)
      : s.first_putt_distance as FirstPuttDistance;
    acc[d] = (acc[d] ?? 0) + 1;
    return acc;
  }, {} as Record<FirstPuttDistance, number>);
  // 最も多い距離帯
  const topPuttDist = Object.entries(puttDistCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as FirstPuttDistance | undefined;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link
        href="/rounds"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <ArrowLeft className="h-4 w-4" />
        ラウンド一覧
      </Link>

      {/* ヘッダー */}
      <div className="flex items-start gap-3">
        <Flag className="h-6 w-6 text-green-600 mt-1" />
        <div>
          <h1 className="text-2xl font-bold">{round.courses?.name ?? '不明なコース'}</h1>
          <p className="text-gray-500">{round.played_at}</p>
          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-bold ${
            round.status === 'completed'
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
          }`}>
            {round.status === 'completed' ? '完了' : '進行中'}
          </span>
        </div>
      </div>

      {/* 統計サマリー */}
      {completedHoles > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="合計スコア" value={`${totalStrokes}`} sub={`${totalStrokes - totalPar >= 0 ? '+' : ''}${totalStrokes - totalPar}`} />
          <StatCard label="入力ホール" value={`${completedHoles}/18`} />
          {fwTotal > 0 && <StatCard label="FWキープ率" value={`${Math.round((fwHits / fwTotal) * 100)}%`} sub={`${fwHits}/${fwTotal}`} />}
          {puttsCount > 0 && <StatCard label="平均パット" value={`${(totalPutts / puttsCount).toFixed(1)}`} sub={`計${totalPutts}`} />}
          {girTotal > 0 && <StatCard label="パーオン率" value={`${Math.round((girHits / girTotal) * 100)}%`} sub={`${girHits}/${girTotal}`} />}
          {topPuttDist && <StatCard label="最多パット距離" value={FIRST_PUTT_DISTANCE_LABELS[topPuttDist]} sub={`${puttDistScores.length}ホール記録`} />}
        </div>
      )}

      {/* コピーボタン */}
      {completedHoles > 0 && (
        <CopyScoreButton
          text={buildCopyText({
            courseName: round.courses?.name ?? '不明なコース',
            playedAt: round.played_at,
            holes,
            scoreMap,
            memos,
            totalStrokes,
            totalPar,
            fwHits,
            fwTotal,
            girHits,
            girTotal,
            totalPutts,
            puttsCount,
          })}
        />
      )}

      {/* スコアテーブル */}
      {holes.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold">スコア詳細</h2>
          <ScoreTable label="OUT" holes={holes.filter(h => h.hole_number <= 9)} scoreMap={scoreMap} />
          <ScoreTable label="IN" holes={holes.filter(h => h.hole_number > 9)} scoreMap={scoreMap} />
        </div>
      )}

      {/* メモ一覧 */}
      {memos.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold">メモ</h2>
          <div className="space-y-2">
            {memos.map(memo => (
              <div key={memo.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-gray-500">Hole {memo.hole_number}</span>
                  <span className="text-xs text-gray-400">{memo.source === 'voice' ? '音声' : 'テキスト'}</span>
                </div>
                <p className="text-sm">{memo.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 総括メモ & AI練習提案（completedのみ） */}
      {round.status === 'completed' && (
        <>
          <ReviewNoteSection roundId={roundId} initialNote={round.review_note} />
          <PracticeSuggestionSection
            roundId={roundId}
            initialSuggestion={practiceSuggestion}
            hasReviewNote={!!round.review_note}
          />
        </>
      )}

      {/* アクションリンク */}
      {round.status === 'in_progress' && (
        <Link
          href={`/play/${roundId}`}
          className="inline-flex items-center justify-center min-h-[48px] rounded-lg bg-green-600 px-6 py-3 text-lg font-bold text-white hover:bg-green-500 transition-colors"
        >
          プレーに戻る
        </Link>
      )}
      {round.status === 'completed' && (
        <Link
          href={`/play/${roundId}/score?edit=1`}
          className="inline-flex items-center justify-center gap-2 min-h-[48px] rounded-lg bg-blue-600 px-6 py-3 text-lg font-bold text-white hover:bg-blue-500 transition-colors"
        >
          <Pencil className="h-5 w-5" />
          スコアを編集
        </Link>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

type ScoreEntry = { strokes: number; putts: number | null; fairway_hit: boolean | null; green_in_reg: boolean | null };
type HoleEntry = { hole_number: number; par: number; distance: number | null };
type MemoEntry = { id: string; hole_number: number; content: string; source: string };

function buildCopyText({
  courseName,
  playedAt,
  holes,
  scoreMap,
  memos,
  totalStrokes,
  totalPar,
  fwHits,
  fwTotal,
  girHits,
  girTotal,
  totalPutts,
  puttsCount,
}: {
  courseName: string;
  playedAt: string;
  holes: HoleEntry[];
  scoreMap: Map<number, ScoreEntry>;
  memos: MemoEntry[];
  totalStrokes: number;
  totalPar: number;
  fwHits: number;
  fwTotal: number;
  girHits: number;
  girTotal: number;
  totalPutts: number;
  puttsCount: number;
}): string {
  const lines: string[] = [];
  lines.push(`# ラウンド結果`);
  lines.push(`コース: ${courseName}`);
  lines.push(`日付: ${playedAt}`);
  lines.push('');
  lines.push('## スコア');
  lines.push('Hole | Par | Score | Putts | FW | GIR');
  lines.push('--- | --- | --- | --- | --- | ---');

  for (const h of holes) {
    const s = scoreMap.get(h.hole_number);
    if (!s) continue;
    const fw = s.fairway_hit === true ? 'o' : s.fairway_hit === false ? 'x' : '-';
    const gir = s.green_in_reg === true ? 'o' : s.green_in_reg === false ? 'x' : '-';
    lines.push(`${h.hole_number} | ${h.par} | ${s.strokes} | ${s.putts ?? '-'} | ${fw} | ${gir}`);
  }

  const diff = totalStrokes - totalPar;
  const diffStr = diff > 0 ? `+${diff}` : diff === 0 ? 'E' : `${diff}`;
  lines.push('');
  lines.push('## 集計');
  lines.push(`合計: ${totalStrokes} (${diffStr})`);
  if (fwTotal > 0) lines.push(`FWキープ率: ${Math.round((fwHits / fwTotal) * 100)}% (${fwHits}/${fwTotal})`);
  if (girTotal > 0) lines.push(`パーオン率: ${Math.round((girHits / girTotal) * 100)}% (${girHits}/${girTotal})`);
  if (puttsCount > 0) lines.push(`平均パット: ${(totalPutts / puttsCount).toFixed(1)} (計${totalPutts})`);

  if (memos.length > 0) {
    lines.push('');
    lines.push('## メモ');
    for (const m of memos) {
      lines.push(`- Hole ${m.hole_number}: ${m.content}`);
    }
  }

  return lines.join('\n');
}

function ScoreTable({
  label,
  holes,
  scoreMap,
}: {
  label: string;
  holes: HoleEntry[];
  scoreMap: Map<number, ScoreEntry>;
}) {
  const totalPar = holes.reduce((sum, h) => sum + h.par, 0);
  const totalScore = holes.reduce((sum, h) => sum + (scoreMap.get(h.hole_number)?.strokes ?? 0), 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <th className="px-1 py-1 text-left">{label}</th>
            {holes.map(h => (
              <th key={h.hole_number} className="px-1 py-1 text-center min-w-[28px]">{h.hole_number}</th>
            ))}
            <th className="px-1 py-1 text-center">計</th>
          </tr>
        </thead>
        <tbody>
          <tr className="text-gray-500">
            <td className="px-1 py-1">Par</td>
            {holes.map(h => (
              <td key={h.hole_number} className="px-1 py-1 text-center">{h.par}</td>
            ))}
            <td className="px-1 py-1 text-center">{totalPar}</td>
          </tr>
          <tr className="font-bold">
            <td className="px-1 py-1">Score</td>
            {holes.map(h => {
              const s = scoreMap.get(h.hole_number);
              if (!s) return <td key={h.hole_number} className="px-1 py-1 text-center text-gray-400">-</td>;
              const diff = s.strokes - h.par;
              const color = diff < 0 ? 'text-blue-600' : diff === 0 ? 'text-green-600' : 'text-red-600';
              return <td key={h.hole_number} className={`px-1 py-1 text-center ${color}`}>{s.strokes}</td>;
            })}
            <td className="px-1 py-1 text-center">{totalScore > 0 ? totalScore : '-'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
