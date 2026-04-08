import { getScoresWithHoles } from '@/actions/score';
import { getGamePlans } from '@/actions/game-plan';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect, notFound } from 'next/navigation';
import { AdvicePage } from '@/features/advice/components/advice-page';

export default async function PlayAdvicePage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/auth/login');

  const { roundId } = await params;
  const [data, gamePlans] = await Promise.all([
    getScoresWithHoles(roundId),
    getGamePlans(roundId),
  ]);

  if (!data) notFound();

  return (
    <AdvicePage
      roundId={roundId}
      courseName={data.round.courseName}
      holes={data.holes}
      scores={data.scores}
      startingCourse={data.round.startingCourse}
      weather={data.round.weather}
      gamePlans={gamePlans}
      targetScore={data.round.targetScore}
    />
  );
}
