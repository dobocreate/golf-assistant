import { getScoresWithHoles } from '@/actions/score';
import { getClubs } from '@/actions/club';
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
  const [data, clubs] = await Promise.all([
    getScoresWithHoles(roundId),
    getClubs(),
  ]);

  if (!data) notFound();

  return (
    <ScoreInput
      roundId={roundId}
      holes={data.holes}
      initialScores={data.scores}
      courseName={data.round.courseName}
      clubs={clubs.map(c => ({ name: c.name }))}
    />
  );
}
