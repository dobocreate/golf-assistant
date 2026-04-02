import { getRoundWithCourse } from '@/actions/round';
import { getScoresWithHoles } from '@/actions/score';
import { getMemos } from '@/actions/memo';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Flag, Pencil, ChevronRight } from 'lucide-react';
import { ReviewNoteSection } from './review-note-section';
import { PracticeSuggestionSection } from './practice-suggestion-section';
import { DeleteRoundButton } from './delete-round-button';
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
  const diff = totalStrokes - totalPar;

  const parMap = new Map(holes.map(h => [h.hole_number, h.par]));

  // ティーショット
  const fwHits = scores.filter(s => s.fairway_hit === true).length;
  const fwTotal = scores.filter(s => s.fairway_hit !== null).length;
  const teeLeft = scores.filter(s => s.tee_shot_lr === 'left').length;
  const teeCenter = scores.filter(s => s.tee_shot_lr === 'center').length;
  const teeRight = scores.filter(s => s.tee_shot_lr === 'right').length;
  const teeDirTotal = teeLeft + teeCenter + teeRight;

  // アプローチ
  const girHits = scores.filter(s => s.green_in_reg === true).length;
  const girTotal = scores.filter(s => s.green_in_reg !== null).length;
  const nonGirHoles = scores.filter(s => s.green_in_reg === false);
  const recoveryHoles = nonGirHoles.filter(s => {
    const par = parMap.get(s.hole_number) ?? 0;
    return par > 0 && s.strokes <= par;
  });

  // パッティング
  const totalPutts = scores.reduce((sum, s) => sum + (s.putts ?? 0), 0);
  const puttsCount = scores.filter(s => s.putts !== null).length;
  const threePutts = scores.filter(s => (s.putts ?? 0) >= 3).length;
  const puttDistScores = scores.filter(s => s.first_putt_distance_m != null || s.first_putt_distance !== null);
  const puttDistCounts = puttDistScores.reduce((acc, s) => {
    const d: FirstPuttDistance = s.first_putt_distance_m != null
      ? distanceToCategory(s.first_putt_distance_m)
      : s.first_putt_distance as FirstPuttDistance;
    acc[d] = (acc[d] ?? 0) + 1;
    return acc;
  }, {} as Record<FirstPuttDistance, number>);
  const topPuttDist = Object.entries(puttDistCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as FirstPuttDistance | undefined;

  // スコア分析
  const { birdies, pars, bogeys, doublePlus, outStrokes, inStrokes } = scores.reduce((acc, s) => {
    if (s.hole_number <= 9) acc.outStrokes += s.strokes;
    else acc.inStrokes += s.strokes;
    const p = parMap.get(s.hole_number) ?? 0;
    if (p > 0) {
      const diffVal = s.strokes - p;
      if (diffVal < 0) acc.birdies++;
      else if (diffVal === 0) acc.pars++;
      else if (diffVal === 1) acc.bogeys++;
      else if (diffVal >= 2) acc.doublePlus++;
    }
    return acc;
  }, { birdies: 0, pars: 0, bogeys: 0, doublePlus: 0, outStrokes: 0, inStrokes: 0 });
  const parSaves = birdies + pars;
  const { outPar, inPar } = holes.reduce((acc, h) => {
    if (!scoreMap.has(h.hole_number)) return acc;
    if (h.hole_number <= 9) acc.outPar += h.par;
    else acc.inPar += h.par;
    return acc;
  }, { outPar: 0, inPar: 0 });

  const diffColor = diff < 0 ? 'text-blue-600' : diff === 0 ? 'text-green-600' : 'text-red-500';

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <Link
        href="/rounds"
        className="inline-flex items-center gap-1 min-h-[48px] text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <ArrowLeft className="h-4 w-4" />
        ラウンド一覧
      </Link>

      {/* ヘッダーカード */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm p-5">
        <div className="flex items-start gap-3">
          <Flag className="h-6 w-6 text-green-600 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold truncate">{round.courses?.name ?? '不明なコース'}</h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm text-gray-500">{round.played_at}</p>
              <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${
                round.status === 'completed'
                  ? 'bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
              }`}>
                {round.status === 'completed' ? '完了' : '進行中'}
              </span>
            </div>
          </div>
        </div>

        {/* スコアハイライト */}
        {completedHoles > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex items-end gap-6">
            <div>
              <p className="text-xs text-gray-400">トータル</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold tabular-nums">{totalStrokes}</span>
                <span className={`text-lg font-bold ${diffColor}`}>
                  {diff >= 0 ? '+' : ''}{diff}
                </span>
              </div>
            </div>
            <div className="flex gap-4 text-sm text-gray-500 pb-1">
              <span>OUT <strong className="text-gray-900 dark:text-gray-100">{outStrokes}</strong></span>
              <span>IN <strong className="text-gray-900 dark:text-gray-100">{inStrokes}</strong></span>
              {puttsCount > 0 && <span>パット <strong className="text-gray-900 dark:text-gray-100">{totalPutts}</strong></span>}
            </div>
          </div>
        )}
      </div>

      {/* スコア詳細テーブル */}
      {holes.length > 0 && (
        <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
          <h2 className="text-sm font-semibold text-gray-500 px-4 pt-4 pb-2">スコア詳細</h2>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            <ScoreTable label="OUT" holes={holes.filter(h => h.hole_number <= 9)} scoreMap={scoreMap} />
            <ScoreTable label="IN" holes={holes.filter(h => h.hole_number > 9)} scoreMap={scoreMap} />
          </div>
        </section>
      )}

      {/* スコア分析 */}
      {completedHoles > 0 && (
        <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
          <details className="group">
            <summary className="flex items-center justify-between cursor-pointer list-none px-4 py-3.5">
              <div className="flex items-center gap-1.5">
                <ChevronRight className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-90" />
                <h2 className="text-sm font-semibold text-gray-500">スコア分析</h2>
              </div>
              <span className="text-xs text-gray-400">
                パーセーブ {Math.round((parSaves / completedHoles) * 100)}% / FW {fwTotal > 0 ? Math.round((fwHits / fwTotal) * 100) : '-'}%
              </span>
            </summary>
            <div className="px-4 pb-4 space-y-4">
              {/* スコア */}
              <StatGroup label="スコア">
                <StatCard label="パーセーブ率" value={`${Math.round((parSaves / completedHoles) * 100)}%`} sub={`${parSaves}/${completedHoles}`} />
                <StatCard label="バーディー" value={`${birdies}`} sub={`パー${pars} / ボギー${bogeys}`} />
                <StatCard label="ダボ以上" value={`${doublePlus}`} sub={`${completedHoles}ホール中`} />
                <StatCard label="OUT / IN" value={`${outStrokes} / ${inStrokes}`} sub={`${outStrokes - outPar >= 0 ? '+' : ''}${outStrokes - outPar} / ${inStrokes - inPar >= 0 ? '+' : ''}${inStrokes - inPar}`} />
              </StatGroup>

              {/* ティーショット */}
              {(fwTotal > 0 || teeDirTotal > 0) && (
                <StatGroup label="ティーショット">
                  {fwTotal > 0 && <StatCard label="FWキープ率" value={`${Math.round((fwHits / fwTotal) * 100)}%`} sub={`${fwHits}/${fwTotal}`} />}
                  {teeDirTotal > 0 && <StatCard label="方向" value={`←${teeLeft} ↑${teeCenter} →${teeRight}`} sub={`${teeDirTotal}ホール`} />}
                </StatGroup>
              )}

              {/* アプローチ */}
              {(girTotal > 0 || nonGirHoles.length > 0) && (
                <StatGroup label="アプローチ">
                  {girTotal > 0 && <StatCard label="パーオン率" value={`${Math.round((girHits / girTotal) * 100)}%`} sub={`${girHits}/${girTotal}`} />}
                  {nonGirHoles.length > 0 && <StatCard label="リカバリー率" value={`${Math.round((recoveryHoles.length / nonGirHoles.length) * 100)}%`} sub={`${recoveryHoles.length}/${nonGirHoles.length}`} />}
                </StatGroup>
              )}

              {/* パッティング */}
              {puttsCount > 0 && (
                <StatGroup label="パッティング">
                  <StatCard label="平均パット" value={`${(totalPutts / puttsCount).toFixed(1)}`} sub={`計${totalPutts}`} />
                  <StatCard label="3パット" value={`${threePutts}回`} sub={threePutts === 0 ? 'なし' : `${completedHoles}ホール中`} />
                  {topPuttDist && <StatCard label="最多パット距離" value={FIRST_PUTT_DISTANCE_LABELS[topPuttDist]} sub={`${puttDistScores.length}ホール`} />}
                </StatGroup>
              )}
            </div>
          </details>
        </section>
      )}

      {/* メモ */}
      {memos.length > 0 && (
        <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
          <details className="group">
            <summary className="flex items-center justify-between cursor-pointer list-none px-4 py-3.5">
              <div className="flex items-center gap-1.5">
                <ChevronRight className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-90" />
                <h2 className="text-sm font-semibold text-gray-500">メモ</h2>
              </div>
              <span className="text-xs text-gray-400">{memos.length}件</span>
            </summary>
            <div className="px-4 pb-4 space-y-2">
              {memos.map(memo => (
                <div key={memo.id} className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Hole {memo.hole_number}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      memo.source === 'voice'
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                    }`}>{memo.source === 'voice' ? '音声' : 'テキスト'}</span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{memo.content}</p>
                </div>
              ))}
            </div>
          </details>
        </section>
      )}

      {/* 総括 & AI練習提案（completedのみ） */}
      {round.status === 'completed' && (
        <>
          <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm p-4">
            <ReviewNoteSection roundId={roundId} initialNote={round.review_note} />
          </section>

          <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm p-4">
            <PracticeSuggestionSection
              roundId={roundId}
              initialSuggestion={practiceSuggestion}
              hasReviewNote={!!round.review_note}
            />
          </section>
        </>
      )}

      {/* アクションリンク */}
      {round.status === 'in_progress' && (
        <Link
          href={`/play/${roundId}`}
          className="inline-flex items-center justify-center min-h-[48px] rounded-lg bg-green-600 px-6 py-3 text-lg font-bold text-white hover:bg-green-700 active:scale-[0.96] transition-all"
        >
          プレーに戻る
        </Link>
      )}

      {/* フローティングアクションボタン（completedのみ） */}
      {round.status === 'completed' && (
        <div className="fixed bottom-6 right-4 z-40 flex gap-2">
          <Link
            href={`/play/${roundId}/score?edit=1`}
            className="min-h-[48px] flex items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg hover:bg-blue-500 active:scale-[0.96] transition-all"
          >
            <Pencil className="h-4 w-4" />
            編集
          </Link>
          <DeleteRoundButton roundId={roundId} />
        </div>
      )}
    </div>
  );
}

function StatGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{label}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {children}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-xl font-bold mt-0.5">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

type ScoreEntry = { strokes: number; putts: number | null; fairway_hit: boolean | null; green_in_reg: boolean | null };
type HoleEntry = { hole_number: number; par: number; distance: number | null };

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
  const totalDiff = totalScore - totalPar;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 dark:text-gray-500 text-xs">
            <th className="px-2 py-2 text-left font-semibold">{label}</th>
            {holes.map(h => (
              <th key={h.hole_number} className="px-1 py-2 text-center min-w-[28px] font-normal">{h.hole_number}</th>
            ))}
            <th className="px-2 py-2 text-center font-semibold">計</th>
          </tr>
        </thead>
        <tbody>
          <tr className="text-gray-400 dark:text-gray-500 text-xs">
            <td className="px-2 py-1.5">Par</td>
            {holes.map(h => (
              <td key={h.hole_number} className="px-1 py-1.5 text-center">{h.par}</td>
            ))}
            <td className="px-2 py-1.5 text-center font-medium">{totalPar}</td>
          </tr>
          <tr className="font-bold text-base">
            <td className="px-2 py-2.5">Score</td>
            {holes.map(h => {
              const s = scoreMap.get(h.hole_number);
              if (!s) return <td key={h.hole_number} className="px-1 py-2.5 text-center text-gray-300 dark:text-gray-600">-</td>;
              const scoreDiff = s.strokes - h.par;
              const color = scoreDiff < 0 ? 'text-blue-600 dark:text-blue-400' : scoreDiff === 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400';
              return <td key={h.hole_number} className={`px-1 py-2.5 text-center ${color}`}>{s.strokes}</td>;
            })}
            <td className="px-2 py-2.5 text-center">
              {totalScore > 0 ? (
                <span>{totalScore} <span className={`text-xs font-normal ${totalDiff < 0 ? 'text-blue-500' : totalDiff === 0 ? 'text-green-500' : 'text-red-500'}`}>({totalDiff >= 0 ? '+' : ''}{totalDiff})</span></span>
              ) : '-'}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
