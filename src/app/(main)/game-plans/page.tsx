import { getGamePlanSets } from '@/actions/game-plan-set';
import { getSavedCourses } from '@/actions/course';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ClipboardList, Plus } from 'lucide-react';
import { GamePlanSetList } from '@/features/game-plan/components/game-plan-set-list';

export default async function GamePlansPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/auth/login');

  const [sets, courses] = await Promise.all([
    getGamePlanSets(),
    getSavedCourses(),
  ]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-green-600" />
          <h1 className="text-2xl font-bold">ゲームプラン</h1>
        </div>
      </div>

      <p className="text-sm text-gray-500">
        コースごとにゲームプランを作成し、ラウンド開始時に選択できます。
      </p>

      <GamePlanSetList sets={sets} courses={courses} />
    </div>
  );
}
