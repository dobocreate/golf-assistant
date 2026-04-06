import { getRoundWithCourse } from '@/actions/round';
import { getCompanions } from '@/actions/companion';
import { getGamePlanSetsByCourse } from '@/actions/game-plan-set';
import { getGamePlans } from '@/actions/game-plan';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect, notFound } from 'next/navigation';
import { PlaySpeedDial } from './play-speed-dial';
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

      {/* フローティングアクションボタン（Speed Dial） */}
      <PlaySpeedDial roundId={roundId} />
    </div>
  );
}
