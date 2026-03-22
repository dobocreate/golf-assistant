import { getRoundWithCourse } from '@/actions/round';
import { getScores } from '@/actions/score';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect, notFound } from 'next/navigation';
import { AdviceClient } from '@/features/advice/components/advice-client';

export default async function AdvicePage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string }>;
  searchParams: Promise<{ hole?: string; lie?: string; slopeFB?: string; slopeLR?: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/auth/login');

  const { roundId } = await params;
  const query = await searchParams;
  const [round, scores] = await Promise.all([
    getRoundWithCourse(roundId),
    getScores(roundId),
  ]);
  if (!round) notFound();

  const scoredHoles = scores.map(s => s.hole_number);

  // クエリパラメータから初期値を構築
  const initialValues = {
    hole: query.hole ? parseInt(query.hole, 10) : undefined,
    lie: query.lie || undefined,
    slopeFB: query.slopeFB || undefined,
    slopeLR: query.slopeLR || undefined,
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="rounded-lg bg-gray-800 border border-gray-700 p-3">
        <p className="text-sm text-gray-400">AIキャディー</p>
        <p className="text-lg font-bold">{round.courses?.name ?? '不明なコース'}</p>
      </div>
      <AdviceClient roundId={roundId} scoredHoles={scoredHoles} initialValues={initialValues} />
    </div>
  );
}
