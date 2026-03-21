import { getRoundWithCourse } from '@/actions/round';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect, notFound } from 'next/navigation';
import { AdviceClient } from '@/features/advice/components/advice-client';

export default async function AdvicePage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/auth/login');

  const { roundId } = await params;
  const round = await getRoundWithCourse(roundId);
  if (!round) notFound();

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="rounded-lg bg-gray-800 border border-gray-700 p-3">
        <p className="text-sm text-gray-400">AIキャディー</p>
        <p className="text-lg font-bold">{round.courses?.name ?? '不明なコース'}</p>
      </div>
      <AdviceClient roundId={roundId} />
    </div>
  );
}
