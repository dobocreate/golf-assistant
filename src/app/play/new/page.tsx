import { getSavedCourses } from '@/actions/course';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect } from 'next/navigation';
import { RoundStartForm } from '@/features/round/components/round-start-form';

export default async function NewRoundPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/auth/login');

  const { courseId } = await searchParams;
  const courses = await getSavedCourses();

  return (
    <div className="max-w-md mx-auto space-y-6">
      <h1 className="text-2xl font-bold">ラウンド開始</h1>
      <RoundStartForm courses={courses} selectedCourseId={courseId} />
    </div>
  );
}
