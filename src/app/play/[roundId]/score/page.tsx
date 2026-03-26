import { getScoresWithHoles } from '@/actions/score';
import { getClubs } from '@/actions/club';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect, notFound } from 'next/navigation';
import { ScoreInput } from '@/features/score/components/score-input';

export default async function ScoreInputPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string }>;
  searchParams: Promise<{ edit?: string; hole?: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/auth/login');

  const { roundId } = await params;
  const { edit, hole } = await searchParams;
  const editMode = edit === '1';
  const parsed = hole ? parseInt(hole, 10) : undefined;
  const initialHole = parsed && !isNaN(parsed) ? parsed : undefined;

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
      editMode={editMode}
      startingCourse={data.round.startingCourse}
      initialHole={initialHole}
      weather={data.round.weather}
    />
  );
}
