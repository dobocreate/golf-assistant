import { getScoresWithHoles } from '@/actions/score';
import { getCompanionScores } from '@/actions/companion';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect, notFound } from 'next/navigation';
import { Scorecard } from '@/features/score/components/scorecard';

export default async function ScorecardPage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/auth/login');

  const { roundId } = await params;

  const [data, companionData] = await Promise.all([
    getScoresWithHoles(roundId),
    getCompanionScores(roundId),
  ]);

  if (!data) notFound();

  return (
    <Scorecard
      holes={data.holes}
      scores={data.scores}
      courseName={data.round.courseName}
      startingCourse={data.round.startingCourse}
      companionData={companionData}
    />
  );
}
