import { getScoresWithHoles } from '@/actions/score';
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
  const data = await getScoresWithHoles(roundId);

  if (!data) notFound();

  return (
    <AdvicePage
      roundId={roundId}
      courseName={data.round.courseName}
      holes={data.holes}
      startingCourse={data.round.startingCourse}
    />
  );
}
