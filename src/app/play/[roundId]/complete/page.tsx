import { getAuthenticatedUser } from '@/lib/auth-utils';
import { getRoundWithCourse } from '@/actions/round';
import { getScores } from '@/actions/score';
import { redirect, notFound } from 'next/navigation';
import { CompleteRoundForm } from '@/features/round/components/complete-round-form';

export default async function RoundCompletePage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/auth/login');

  const { roundId } = await params;
  const round = await getRoundWithCourse(roundId);
  if (!round) notFound();

  // 既に完了済みなら振り返り画面へ
  if (round.status === 'completed') {
    redirect(`/rounds/${roundId}`);
  }

  const scores = await getScores(roundId);

  // 入力済みホール番号と未入力ホール番号を算出
  const scoredHoles = new Set(scores.map((s) => s.hole_number));
  const missingHoles: number[] = [];
  for (let h = 1; h <= 18; h++) {
    if (!scoredHoles.has(h)) missingHoles.push(h);
  }

  const totalStrokes = scores.reduce((sum, s) => sum + s.strokes, 0);
  const holesCompleted = scores.length;

  return (
    <div className="max-w-md mx-auto space-y-6">
      {/* ヘッダー */}
      <div className="rounded-lg bg-gray-800 border border-gray-700 p-4">
        <p className="text-sm text-gray-400">ラウンド完了確認</p>
        <h1 className="text-xl font-bold text-white mt-1">
          {round.courses?.name ?? '不明なコース'}
        </h1>
        <p className="text-sm text-gray-400 mt-1">{round.played_at}</p>
      </div>

      {/* スコアサマリー */}
      <div className="rounded-lg bg-gray-800 border border-gray-700 p-4 space-y-3">
        <h2 className="text-lg font-bold text-gray-200">スコアサマリー</h2>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold text-green-400">
            {totalStrokes > 0 ? totalStrokes : '-'}
          </span>
          <span className="text-gray-400 text-lg">打</span>
        </div>
        <p className="text-gray-400">
          入力済み: {holesCompleted} / 18 ホール
        </p>
      </div>

      {/* 未入力ホール警告 */}
      {missingHoles.length > 0 && (
        <div className="rounded-lg bg-yellow-900/50 border border-yellow-700 p-4 space-y-2">
          <p className="text-yellow-200 font-bold">
            未入力のホールがあります
          </p>
          <p className="text-yellow-300 text-sm">
            ホール: {missingHoles.join(', ')}
          </p>
          <p className="text-yellow-400 text-xs">
            未入力のまま完了すると、合計スコアは入力済みホールのみで計算されます。
          </p>
        </div>
      )}

      <CompleteRoundForm roundId={roundId} />
    </div>
  );
}
