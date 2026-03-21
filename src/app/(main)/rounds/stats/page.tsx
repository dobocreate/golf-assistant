import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { Score } from '@/features/score/types';

interface RoundRow {
  id: string;
  played_at: string;
  total_score: number | null;
  courses: { name: string } | null;
}

interface HoleRow {
  course_id: string;
  hole_number: number;
  par: number;
}

export default async function RoundStatsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/auth/login');

  const supabase = await createClient();

  // Fetch completed rounds
  const { data: roundsRaw } = await supabase
    .from('rounds')
    .select('id, played_at, total_score, course_id, courses(name)')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .order('played_at', { ascending: true });

  const rounds = (roundsRaw ?? []) as unknown as (RoundRow & { course_id: string })[];

  if (rounds.length === 0) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Link
          href="/rounds"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          <ArrowLeft className="h-4 w-4" />
          ラウンド一覧
        </Link>
        <h1 className="text-2xl font-bold">スコア統計</h1>
        <p className="text-gray-500 text-center py-12">
          完了したラウンドがありません。ラウンドを完了すると統計が表示されます。
        </p>
      </div>
    );
  }

  // Fetch all scores for these rounds
  const roundIds = rounds.map((r) => r.id);
  const { data: scoresRaw } = await supabase
    .from('scores')
    .select('*')
    .in('round_id', roundIds)
    .order('hole_number');

  const scores = (scoresRaw as Score[]) ?? [];

  // Fetch hole info for par data
  const courseIds = [...new Set(rounds.map((r) => r.course_id))];
  const { data: holesRaw } = await supabase
    .from('holes')
    .select('course_id, hole_number, par')
    .in('course_id', courseIds);

  const holes = (holesRaw as HoleRow[]) ?? [];

  // Build lookup maps
  const scoresByRound = new Map<string, Score[]>();
  for (const s of scores) {
    const list = scoresByRound.get(s.round_id) ?? [];
    list.push(s);
    scoresByRound.set(s.round_id, list);
  }

  const holesByCourse = new Map<string, Map<number, number>>();
  for (const h of holes) {
    if (!holesByCourse.has(h.course_id)) {
      holesByCourse.set(h.course_id, new Map());
    }
    holesByCourse.get(h.course_id)!.set(h.hole_number, h.par);
  }

  // --- Compute stats ---

  // 1. Score progression
  const scoreProgression = rounds.map((r, i) => {
    const prev = i > 0 ? rounds[i - 1].total_score : null;
    const current = r.total_score;
    let trend: 'up' | 'down' | 'same' | null = null;
    if (current !== null && prev !== null) {
      if (current < prev) trend = 'down';
      else if (current > prev) trend = 'up';
      else trend = 'same';
    }
    return {
      playedAt: r.played_at,
      courseName: (r.courses as { name: string } | null)?.name ?? '不明',
      totalScore: current,
      trend,
    };
  });

  // 2. OUT vs IN comparison
  let totalOut = 0;
  let countOut = 0;
  let totalIn = 0;
  let countIn = 0;

  for (const r of rounds) {
    const rs = scoresByRound.get(r.id) ?? [];
    let outScore = 0;
    let outHoles = 0;
    let inScore = 0;
    let inHoles = 0;
    for (const s of rs) {
      if (s.hole_number <= 9) {
        outScore += s.strokes;
        outHoles++;
      } else {
        inScore += s.strokes;
        inHoles++;
      }
    }
    if (outHoles === 9) {
      totalOut += outScore;
      countOut++;
    }
    if (inHoles === 9) {
      totalIn += inScore;
      countIn++;
    }
  }

  const avgOut = countOut > 0 ? totalOut / countOut : null;
  const avgIn = countIn > 0 ? totalIn / countIn : null;

  // 3. Par-based averages
  const parScores: Record<number, { total: number; count: number }> = {
    3: { total: 0, count: 0 },
    4: { total: 0, count: 0 },
    5: { total: 0, count: 0 },
  };

  for (const r of rounds) {
    const rs = scoresByRound.get(r.id) ?? [];
    const parMap = holesByCourse.get(r.course_id);
    if (!parMap) continue;
    for (const s of rs) {
      const par = parMap.get(s.hole_number);
      if (par && parScores[par]) {
        parScores[par].total += s.strokes;
        parScores[par].count++;
      }
    }
  }

  // 4. FW keep rate per round
  const fwRates = rounds
    .map((r) => {
      const rs = scoresByRound.get(r.id) ?? [];
      const fwTotal = rs.filter((s) => s.fairway_hit !== null).length;
      const fwHits = rs.filter((s) => s.fairway_hit === true).length;
      if (fwTotal === 0) return null;
      return {
        playedAt: r.played_at,
        rate: Math.round((fwHits / fwTotal) * 100),
      };
    })
    .filter(Boolean) as { playedAt: string; rate: number }[];

  // 5. GIR rate per round
  const girRates = rounds
    .map((r) => {
      const rs = scoresByRound.get(r.id) ?? [];
      const girTotal = rs.filter((s) => s.green_in_reg !== null).length;
      const girHits = rs.filter((s) => s.green_in_reg === true).length;
      if (girTotal === 0) return null;
      return {
        playedAt: r.played_at,
        rate: Math.round((girHits / girTotal) * 100),
      };
    })
    .filter(Boolean) as { playedAt: string; rate: number }[];

  const maxScore = Math.max(
    ...scoreProgression.filter((s) => s.totalScore !== null).map((s) => s.totalScore!),
    100,
  );

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <Link
        href="/rounds"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <ArrowLeft className="h-4 w-4" />
        ラウンド一覧
      </Link>

      <h1 className="text-2xl font-bold">スコア統計</h1>

      {/* Score Progression */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">スコア推移</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b border-gray-200 dark:border-gray-700">
                <th className="px-2 py-2 text-left">日付</th>
                <th className="px-2 py-2 text-left">コース</th>
                <th className="px-2 py-2 text-right">スコア</th>
                <th className="px-2 py-2 text-center">推移</th>
              </tr>
            </thead>
            <tbody>
              {[...scoreProgression].reverse().map((row, i) => (
                <tr
                  key={`${row.playedAt}-${i}`}
                  className="border-b border-gray-100 dark:border-gray-800"
                >
                  <td className="px-2 py-2 whitespace-nowrap">{row.playedAt}</td>
                  <td className="px-2 py-2 truncate max-w-[140px]">{row.courseName}</td>
                  <td className="px-2 py-2 text-right font-bold">
                    {row.totalScore ?? '-'}
                  </td>
                  <td className="px-2 py-2 text-center">
                    {row.trend === 'down' && (
                      <TrendingDown className="h-4 w-4 text-blue-600 inline" />
                    )}
                    {row.trend === 'up' && (
                      <TrendingUp className="h-4 w-4 text-red-600 inline" />
                    )}
                    {row.trend === 'same' && (
                      <Minus className="h-4 w-4 text-gray-400 inline" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* OUT vs IN */}
      {(avgOut !== null || avgIn !== null) && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">前半/後半比較</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">OUT 平均</p>
              <p className="text-3xl font-bold">
                {avgOut !== null ? avgOut.toFixed(1) : '-'}
              </p>
              {avgOut !== null && (
                <div className="mt-2">
                  <CssBar value={avgOut} max={maxScore / 2} color="bg-blue-500" />
                </div>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">IN 平均</p>
              <p className="text-3xl font-bold">
                {avgIn !== null ? avgIn.toFixed(1) : '-'}
              </p>
              {avgIn !== null && (
                <div className="mt-2">
                  <CssBar value={avgIn} max={maxScore / 2} color="bg-green-500" />
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Par-based averages */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Par別平均スコア</h2>
        <div className="space-y-3">
          {([3, 4, 5] as const).map((par) => {
            const data = parScores[par];
            if (data.count === 0) return null;
            const avg = data.total / data.count;
            const diff = avg - par;
            return (
              <div
                key={par}
                className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold">Par {par}</span>
                  <div className="text-right">
                    <span className="text-xl font-bold">{avg.toFixed(2)}</span>
                    <span className={`ml-2 text-sm font-bold ${diff > 0 ? 'text-red-600' : diff < 0 ? 'text-blue-600' : 'text-green-600'}`}>
                      {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                    </span>
                  </div>
                </div>
                <CssBar value={avg} max={par * 2} color={diff > 0.5 ? 'bg-red-500' : diff > 0 ? 'bg-yellow-500' : 'bg-green-500'} />
                <p className="text-xs text-gray-400 mt-1">{data.count}ホールの平均</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* FW Keep Rate */}
      {fwRates.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">FWキープ率推移</h2>
          <div className="space-y-2">
            {[...fwRates].reverse().map((r, i) => (
              <div
                key={`${r.playedAt}-${i}`}
                className="flex items-center gap-3"
              >
                <span className="text-xs text-gray-500 w-24 shrink-0">{r.playedAt}</span>
                <div className="flex-1">
                  <CssBar value={r.rate} max={100} color="bg-blue-500" />
                </div>
                <span className="text-sm font-bold w-12 text-right">{r.rate}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* GIR Rate */}
      {girRates.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">パーオン率推移</h2>
          <div className="space-y-2">
            {[...girRates].reverse().map((r, i) => (
              <div
                key={`${r.playedAt}-${i}`}
                className="flex items-center gap-3"
              >
                <span className="text-xs text-gray-500 w-24 shrink-0">{r.playedAt}</span>
                <div className="flex-1">
                  <CssBar value={r.rate} max={100} color="bg-green-500" />
                </div>
                <span className="text-sm font-bold w-12 text-right">{r.rate}%</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CssBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  return (
    <div className="h-3 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
      <div
        className={`h-full rounded-full ${color} transition-all`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
