import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Flag } from 'lucide-react';

export default async function RoundsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/auth/login');

  const supabase = await createClient();
  const { data: rounds } = await supabase
    .from('rounds')
    .select('id, played_at, total_score, status, courses(name)')
    .eq('user_id', user.id)
    .order('played_at', { ascending: false });

  const roundList = rounds ?? [];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">ラウンド履歴</h1>

      {roundList.length === 0 ? (
        <div className="text-center py-12">
          <Flag className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">ラウンド履歴がありません</p>
          <Link
            href="/play"
            className="inline-flex items-center justify-center mt-4 min-h-[48px] rounded-lg bg-green-600 px-6 py-3 font-bold text-white hover:bg-green-500 transition-colors"
          >
            ラウンドを開始
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {roundList.map(round => {
            const courseName = ((round.courses as unknown) as { name: string } | null)?.name ?? '不明なコース';
            return (
              <Link
                key={round.id}
                href={`/rounds/${round.id}`}
                className="block rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold">{courseName}</p>
                    <p className="text-sm text-gray-500">{round.played_at}</p>
                  </div>
                  <div className="text-right">
                    {round.total_score ? (
                      <p className="text-2xl font-bold">{round.total_score}</p>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 font-bold">
                        進行中
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
