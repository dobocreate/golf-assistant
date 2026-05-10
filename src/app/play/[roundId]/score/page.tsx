import { getScoresWithHoles } from '@/actions/score';
import { getClubs } from '@/actions/club';
import { getGamePlans } from '@/actions/game-plan';
import { getProfile } from '@/actions/profile';
import { getCompanions, getCompanionScores } from '@/actions/companion';
import { getHoleMapDataAllForCourse, type HoleMapData } from '@/actions/hole-map';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect } from 'next/navigation';
import { ScoreClientShell, type ServerData } from '@/features/score/components/score-client-shell';

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

  let serverData: ServerData | null = null;

  try {
    // 2 段階 fetch: courseId が必要な map prefetch (Sprint 5 PR10) のため
    // getScoresWithHoles を先に解決してから残りを並列取得
    const data = await getScoresWithHoles(roundId);

    const [clubs, gamePlans, profile, companions, companionData, mapDataByHole] = await Promise.all([
      getClubs(),
      getGamePlans(roundId),
      getProfile(),
      getCompanions(roundId),
      getCompanionScores(roundId),
      // S-5e: ラウンド開始時に全 18 ホール map data を 3 query で一括取得
      data ? getHoleMapDataAllForCourse(data.round.courseId) : Promise.resolve(new Map<number, HoleMapData>()),
    ]);

    if (data) {
      // 同伴者スコアをフラットな配列に変換
      const allCompanionScores = companionData.flatMap(cd => cd.scores);

      // ShotPositionRecorder へ伝搬するため Map → Array にシリアライズ
      const initialMapDataByHole = Array.from(mapDataByHole.entries()).map(([holeNumber, m]) => ({
        holeNumber,
        ...m,
      }));

      serverData = {
        roundId,
        holes: data.holes,
        initialScores: data.scores,
        courseName: data.round.courseName,
        clubs: clubs.map(c => ({ name: c.name })),
        editMode,
        startingCourse: data.round.startingCourse,
        initialHole,
        weather: data.round.weather,
        gamePlans,
        targetScore: data.round.targetScore,
        scoreLevel: profile?.score_level ?? null,
        handicap: profile?.handicap ?? null,
        companions,
        initialCompanionScores: allCompanionScores,
        initialMapDataByHole,
      };
    }
  } catch {
    // サーバーデータ取得失敗 → serverData = null のまま
    // Client Shellがオフラインモードで復帰を試みる
  }

  return <ScoreClientShell serverData={serverData} roundId={roundId} />;
}
