import { getGamePlanSetWithHoles } from '@/actions/game-plan-set';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { GamePlanSetEditor } from '@/features/game-plan/components/game-plan-set-editor';

export default async function GamePlanSetEditPage({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/auth/login');

  const { setId } = await params;
  const planSet = await getGamePlanSetWithHoles(setId);
  if (!planSet) notFound();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link
        href="/game-plans"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <ArrowLeft className="h-4 w-4" />
        ゲームプラン一覧
      </Link>

      <GamePlanSetEditor planSet={planSet} />
    </div>
  );
}
