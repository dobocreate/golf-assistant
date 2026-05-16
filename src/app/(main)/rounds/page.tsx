import { requireUser, db } from '@/lib/db/neon';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { Flag, BarChart3 } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ラウンド履歴 | Golf Assistant',
};

interface RoundRow {
  id: string;
  played_at: string;
  total_score: number | null;
  status: string;
  course_name: string | null;
}

export default async function RoundsPage() {
  let rounds: RoundRow[];
  try {
    rounds = await requireUser(async () => {
      return db.userRead(async (client) => {
        const r = await client.query<RoundRow>(
          `SELECT r.id, r.played_at, r.total_score, r.status,
                  c.name AS course_name
             FROM rounds r
             LEFT JOIN courses c ON c.id = r.course_id
            WHERE r.user_id = current_user_id()::uuid
            ORDER BY r.played_at DESC`,
        );
        return r.rows;
      });
    });
  } catch {
    redirect('/auth/login');
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ラウンド履歴</h1>
        <ButtonLink
          href="/rounds/stats"
          variant="outline"
          className="gap-1.5"
        >
          <BarChart3 className="h-4 w-4" />
          統計
        </ButtonLink>
      </div>

      {rounds.length === 0 ? (
        <div className="text-center py-12">
          <Flag className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">ラウンド履歴がありません</p>
          <ButtonLink
            href="/play"
            size="lg"
            className="mt-4"
          >
            ラウンドを開始
          </ButtonLink>
        </div>
      ) : (
        <div className="space-y-3">
          {rounds.map(round => {
            const courseName = round.course_name ?? '不明なコース';
            return (
              <Link
                key={round.id}
                href={`/rounds/${round.id}`}
                className="block rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
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
