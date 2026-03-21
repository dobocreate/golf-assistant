import Link from 'next/link';
import { Flag, Plus, ArrowRight } from 'lucide-react';
import { getActiveRound } from '@/actions/round';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect } from 'next/navigation';

export default async function PlayPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/auth/login');

  // 進行中のラウンドがあるか確認
  const activeRound = await getActiveRound();

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6">
      <Flag className="h-16 w-16 text-green-400" />
      <h1 className="text-2xl font-bold">ラウンド</h1>

      {activeRound ? (
        <div className="w-full max-w-md space-y-4">
          <div className="rounded-lg bg-gray-800 border border-gray-700 p-4">
            <p className="text-sm text-gray-400 mb-1">進行中のラウンド</p>
            <p className="text-lg font-bold text-white">
              {activeRound.courses?.name}
            </p>
            <p className="text-sm text-gray-400 mt-1">{activeRound.played_at}</p>
          </div>
          <Link
            href={`/play/${activeRound.id}`}
            className="min-h-[56px] w-full flex items-center justify-center gap-2 rounded-lg bg-green-600 px-8 py-4 text-xl font-bold text-white hover:bg-green-500 transition-colors"
          >
            プレーを続ける
            <ArrowRight className="h-5 w-5" />
          </Link>
          <Link
            href="/play/new"
            className="min-h-[48px] w-full flex items-center justify-center gap-2 rounded-lg bg-gray-700 px-6 py-3 text-lg font-bold text-gray-200 hover:bg-gray-600 transition-colors"
          >
            <Plus className="h-5 w-5" />
            新しいラウンドを開始
          </Link>
        </div>
      ) : (
        <div className="w-full max-w-md space-y-4">
          <p className="text-gray-300 text-center text-lg">
            コースを選択してプレーを開始しましょう
          </p>
          <Link
            href="/play/new"
            className="min-h-[56px] w-full flex items-center justify-center gap-2 rounded-lg bg-green-600 px-8 py-4 text-xl font-bold text-white hover:bg-green-500 transition-colors"
          >
            <Plus className="h-5 w-5" />
            ラウンドを開始
          </Link>
        </div>
      )}
    </div>
  );
}
