import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/actions/profile';
import { getActiveRound } from '@/actions/round';
import { ButtonLink } from '@/components/ui/button';
import { Flag, Search, Play, User, ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ダッシュボード | Golf Assistant',
};

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <section className="flex min-h-[80vh] flex-col items-center justify-center p-8">
        <h1 className="text-4xl font-bold mb-4">Golf Assistant</h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
          AIキャディーがあなたのプレーをサポート
        </p>
        <Link
          href="/auth/login"
          className="rounded-lg bg-primary px-6 py-3 text-primary-foreground font-medium hover:opacity-90 transition-opacity"
        >
          ログイン
        </Link>
      </section>
    );
  }

  // Fetch data in parallel
  const [profile, activeRound, recentRoundsResult] = await Promise.all([
    getProfile(),
    getActiveRound(),
    supabase
      .from('rounds')
      .select('id, played_at, total_score, status, courses(name)')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('played_at', { ascending: false })
      .limit(3),
  ]);

  const recentRounds = recentRoundsResult.data ?? [];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">ダッシュボード</h1>

      {/* Profile banner */}
      {!profile && (
        <Link
          href="/profile"
          className="block rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 p-4 hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors"
        >
          <div className="flex items-center gap-3">
            <User className="h-6 w-6 text-amber-600 dark:text-amber-400 shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-amber-800 dark:text-amber-200">プロフィールを設定してAIキャディーを活用しましょう</p>
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-0.5">飛距離やミス傾向を登録すると、より的確なアドバイスが得られます</p>
            </div>
            <ArrowRight className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
          </div>
        </Link>
      )}

      {/* Active round card */}
      {activeRound && (
        <Link
          href={`/play/${activeRound.id}`}
          className="block rounded-lg border-2 border-green-500 dark:border-green-600 bg-green-50 dark:bg-green-950 p-4 hover:bg-green-100 dark:hover:bg-green-900 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Play className="h-6 w-6 text-green-600 dark:text-green-400 shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-green-700 dark:text-green-300 font-medium">進行中のラウンド</p>
              <p className="font-bold text-green-900 dark:text-green-100">
                {activeRound.courses?.name ?? '不明なコース'}
              </p>
              <p className="text-sm text-green-600 dark:text-green-400">{activeRound.played_at}</p>
            </div>
            <span className="min-h-[48px] inline-flex items-center rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white">
              続ける
            </span>
          </div>
        </Link>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <ButtonLink
          href="/play"
          variant="outline"
          className="flex-col gap-2 min-h-[96px] shadow-sm"
        >
          <Flag className="h-7 w-7 text-green-600" />
          <span className="font-bold text-sm">ラウンド開始</span>
        </ButtonLink>
        <ButtonLink
          href="/courses"
          variant="outline"
          className="flex-col gap-2 min-h-[96px] shadow-sm"
        >
          <Search className="h-7 w-7 text-blue-600" />
          <span className="font-bold text-sm">コース検索</span>
        </ButtonLink>
      </div>

      {/* Recent rounds */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">直近のラウンド</h2>
          <Link href="/rounds" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            すべて見る
          </Link>
        </div>

        {recentRounds.length === 0 ? (
          <div className="text-center py-8 rounded-lg border border-gray-200 dark:border-gray-700">
            <Flag className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-500">まだラウンド記録がありません</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentRounds.map(round => {
              const courseName = ((round.courses as unknown) as { name: string } | null)?.name ?? '不明なコース';
              return (
                <Link
                  key={round.id}
                  href={`/rounds/${round.id}`}
                  className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors min-h-[48px]"
                >
                  <div>
                    <p className="font-bold">{courseName}</p>
                    <p className="text-sm text-gray-500">{round.played_at}</p>
                  </div>
                  {round.total_score && (
                    <p className="text-2xl font-bold">{round.total_score}</p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
