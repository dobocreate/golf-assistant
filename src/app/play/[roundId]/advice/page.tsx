import { getRoundWithCourse } from '@/actions/round';
import { getScores } from '@/actions/score';
import { getShot } from '@/actions/shot';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect, notFound } from 'next/navigation';
import { AdviceClient } from '@/features/advice/components/advice-client';

export default async function AdvicePage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string }>;
  searchParams: Promise<{ hole?: string; shotNumber?: string; lie?: string; slopeFB?: string; slopeLR?: string; shotType?: string; distance?: string }>;
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

  const holeNumber = query.hole ? parseInt(query.hole, 10) : undefined;
  const shotNumber = query.shotNumber ? parseInt(query.shotNumber, 10) : undefined;

  // DBからショット取得を試み、取得できたらその値を使う。できなければ searchParams のフォールバック
  let initialLie: string | undefined = query.lie || undefined;
  let initialSlopeFB: string | undefined = query.slopeFB || undefined;
  let initialSlopeLR: string | undefined = query.slopeLR || undefined;
  let initialShotType: string | undefined = query.shotType || undefined;
  let initialDistance: number | undefined = query.distance ? parseInt(query.distance, 10) : undefined;

  if (holeNumber && shotNumber) {
    const shot = await getShot(roundId, holeNumber, shotNumber);
    if (shot) {
      initialLie = shot.lie ?? undefined;
      initialSlopeFB = shot.slope_fb ?? undefined;
      initialSlopeLR = shot.slope_lr ?? undefined;
      if (!initialShotType) initialShotType = shot.shot_type ?? undefined;
      if (initialDistance == null) initialDistance = shot.remaining_distance ?? undefined;
    }
  }

  const initialValues = {
    hole: holeNumber,
    lie: initialLie,
    slopeFB: initialSlopeFB,
    slopeLR: initialSlopeLR,
    shotNumber,
    shotType: initialShotType,
    remainingDistance: initialDistance,
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
