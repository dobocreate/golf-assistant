import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Plus } from 'lucide-react';
import { getKnowledgeList } from '@/actions/knowledge';
import { KnowledgeListClient } from '@/features/knowledge/components/knowledge-list-client';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ナレッジベース | Golf Assistant',
};

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/auth/login');

  const { category } = await searchParams;
  const allItems = await getKnowledgeList(null);
  const filteredItems = category
    ? allItems.filter((item) => item.category === category)
    : allItems;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ナレッジベース</h1>
        <Link
          href="/knowledge/new"
          className="inline-flex items-center gap-1.5 min-h-[44px] rounded-lg bg-green-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-700 active:scale-[0.96] transition-all"
        >
          <Plus className="h-4 w-4" />
          追加
        </Link>
      </div>

      {allItems.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400 mb-1">
            ナレッジがまだありません
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">
            練習で学んだコツやコース攻略のメモを記録しましょう
          </p>
          <Link
            href="/knowledge/new"
            className="inline-flex items-center justify-center min-h-[48px] rounded-lg bg-green-600 px-6 py-3 font-bold text-white hover:bg-green-700 active:scale-[0.96] transition-all"
          >
            <Plus className="h-4 w-4 mr-2" />
            最初のナレッジを追加
          </Link>
        </div>
      ) : (
        <KnowledgeListClient
          allItems={allItems}
          filteredItems={filteredItems}
          currentCategory={category || null}
        />
      )}
    </div>
  );
}
