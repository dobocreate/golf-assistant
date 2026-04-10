import { getScoresWithHoles } from '@/actions/score';
import { getClubs } from '@/actions/club';
import { getGamePlans } from '@/actions/game-plan';
import { getProfile } from '@/actions/profile';
import { getCompanions, getCompanionScores } from '@/actions/companion';
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
    const [data, clubs, gamePlans, profile, companions, companionData] = await Promise.all([
      getScoresWithHoles(roundId),
      getClubs(),
      getGamePlans(roundId),
      getProfile(),
      getCompanions(roundId),
      getCompanionScores(roundId),
    ]);

    if (data) {
      // 同伴者スコアをフラットな配列に変換
      const allCompanionScores = companionData.flatMap(cd => cd.scores);

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
      };
    }
  } catch {
    // サーバーデータ取得失敗 → serverData = null のまま
    // Client Shellがオフラインモードで復帰を試みる
  }

  return <ScoreClientShell serverData={serverData} roundId={roundId} />;
}
