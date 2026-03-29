import { getRoundWithCourse } from '@/actions/round';
import { getCompanions } from '@/actions/companion';
import { getGamePlanSetsByCourse } from '@/actions/game-plan-set';
import { getGamePlans } from '@/actions/game-plan';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { Pencil, CheckCircle } from 'lucide-react';
import { CompanionManager } from '@/features/companion/components/companion-manager';
import { StartingCourseToggle } from '@/features/round/components/starting-course-toggle';
import { WeatherWindSetting } from '@/features/round/components/weather-wind-setting';
import { GamePlanSelector } from '@/features/round/components/game-plan-selector';

export default async function PlayMainPage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/auth/login');

  const { roundId } = await params;
  const [round, companions] = await Promise.all([
    getRoundWithCourse(roundId),
    getCompanions(roundId),
  ]);

  if (!round) notFound();

  const [gamePlanSets, appliedPlans] = await Promise.all([
    round.course_id ? getGamePlanSetsByCourse(round.course_id) : Promise.resolve([]),
    getGamePlans(roundId),
  ]);

  // 適用済みプランを特定（game_plansにデータがあれば適用済み）
  const appliedPlanName = appliedPlans.length > 0
    ? gamePlanSets.find(s => {
        // セットの目標スコアとラウンドのtarget_scoreが一致すればそのセット
        return s.target_score === round.target_score;
      })?.name ?? '適用済み'
    : null;

  const course = round.courses;

  return (
    <div className="max-w-md mx-auto space-y-6">
      {/* ラウンド情報ヘッダー */}
      <div className="rounded-lg bg-gray-800 border border-gray-700 p-4">
        <p className="text-sm text-gray-300">プレー中</p>
        <h1 className="text-xl font-bold text-white mt-1">
          {course?.name ?? '不明なコース'}
        </h1>
        <p className="text-sm text-gray-300 mt-1">{round.played_at}</p>
        {round.total_score && (
          <p className="text-2xl font-bold text-green-400 mt-2">
            {round.total_score}
          </p>
        )}
      </div>

      {/* ラウンド設定 */}
      <StartingCourseToggle roundId={roundId} initialValue={round.starting_course} />
      <WeatherWindSetting roundId={roundId} initialWeather={round.weather} initialWind={round.wind} />

      {/* 同伴者管理 */}
      <CompanionManager roundId={roundId} initialCompanions={companions} />

      {/* ゲームプラン選択 */}
      <GamePlanSelector roundId={roundId} plans={gamePlanSets} currentPlanName={appliedPlanName} />

      {/* フローティングアクションボタン */}
      <div className="fixed bottom-[var(--play-nav-height)] right-4 z-40 mb-3 flex gap-2">
        <Link
          href={`/play/${roundId}/score`}
          className="min-h-[48px] flex items-center justify-center gap-2 rounded-full bg-green-600 px-5 py-3 text-sm font-bold text-white shadow-lg hover:bg-green-500 transition-colors"
        >
          <Pencil className="h-4 w-4" />
          スコア入力
        </Link>
        <Link
          href={`/play/${roundId}/complete`}
          className="min-h-[48px] flex items-center justify-center gap-2 rounded-full bg-gray-700 px-5 py-3 text-sm font-bold text-gray-200 shadow-lg hover:bg-gray-600 transition-colors"
        >
          <CheckCircle className="h-4 w-4" />
          完了
        </Link>
      </div>
    </div>
  );
}
