import { getSavedCourses } from '@/actions/course';
import { getGamePlanSets } from '@/actions/game-plan-set';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect } from 'next/navigation';
import { RoundStartForm } from '@/features/round/components/round-start-form';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ラウンド開始 | Golf Assistant',
};

export default async function NewRoundPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/auth/login');

  const { courseId } = await searchParams;
  const [courses, gamePlanSets] = await Promise.all([
    getSavedCourses(),
    getGamePlanSets(),
  ]);

  return (
    <div className="max-w-md mx-auto space-y-6">
      <h1 className="text-2xl font-bold">ラウンド開始</h1>
      <RoundStartForm courses={courses} selectedCourseId={courseId} gamePlanSets={gamePlanSets} />
    </div>
  );
}
