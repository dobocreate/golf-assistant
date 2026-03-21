import { getScoresWithHoles } from '@/actions/score';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect, notFound } from 'next/navigation';
import { ScoreInput } from '@/features/score/components/score-input';

export default async function ScoreInputPage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/auth/login');

  const { roundId } = await params;
  const data = await getScoresWithHoles(roundId);

  if (!data) notFound();

  return (
    <ScoreInput
      roundId={roundId}
      holes={data.holes}
      initialScores={data.scores}
      courseName={data.round.courseName}
    />
  );
}
