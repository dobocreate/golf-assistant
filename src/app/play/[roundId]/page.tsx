import { getRoundWithCourse } from '@/actions/round';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { Pencil, CheckCircle } from 'lucide-react';

export default async function PlayMainPage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/auth/login');

  const { roundId } = await params;
  const round = await getRoundWithCourse(roundId);

  if (!round) notFound();

  const course = round.courses;

  return (
    <div className="max-w-md mx-auto space-y-6">
      {/* ラウンド情報ヘッダー */}
      <div className="rounded-lg bg-gray-800 border border-gray-700 p-4">
        <p className="text-sm text-gray-400">プレー中</p>
        <h1 className="text-xl font-bold text-white mt-1">
          {course?.name ?? '不明なコース'}
        </h1>
        <p className="text-sm text-gray-400 mt-1">{round.played_at}</p>
        {round.total_score && (
          <p className="text-2xl font-bold text-green-400 mt-2">
            {round.total_score}
          </p>
        )}
      </div>

      {/* アクションボタン */}
      <div className="space-y-3">
        <Link
          href={`/play/${roundId}/score`}
          className="min-h-[56px] w-full flex items-center justify-center gap-3 rounded-lg bg-green-600 px-6 py-4 text-xl font-bold text-white hover:bg-green-500 transition-colors"
        >
          <Pencil className="h-6 w-6" />
          スコア入力
        </Link>

        <Link
          href={`/play/${roundId}/complete`}
          className="min-h-[48px] w-full flex items-center justify-center gap-3 rounded-lg bg-gray-700 px-6 py-3 text-lg font-bold text-gray-200 hover:bg-gray-600 transition-colors"
        >
          <CheckCircle className="h-5 w-5" />
          ラウンド完了
        </Link>
      </div>
    </div>
  );
}
