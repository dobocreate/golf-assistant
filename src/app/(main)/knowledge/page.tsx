import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Plus } from 'lucide-react';
import { getKnowledgeList } from '@/actions/knowledge';
import { CategoryTabs } from '@/features/knowledge/components/category-tabs';
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
  const items = await getKnowledgeList(category || null);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">ナレッジベース</h1>

      {/* フローティング新規追加ボタン */}
      <Link
        href="/knowledge/new"
        className="fixed bottom-6 right-4 z-40 min-h-[48px] flex items-center justify-center gap-2 rounded-full bg-green-600 px-5 py-3 text-sm font-bold text-white shadow-lg hover:bg-green-500 transition-colors"
      >
        <Plus className="h-4 w-4" />
        新規追加
      </Link>

      <CategoryTabs />

      {items.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">
            {category ? `「${category}」のナレッジがありません` : 'ナレッジがまだありません'}
          </p>
          <Link
            href="/knowledge/new"
            className="inline-flex items-center justify-center mt-4 min-h-[48px] rounded-lg bg-green-600 px-6 py-3 font-bold text-white hover:bg-green-500 transition-colors"
          >
            ナレッジを追加
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/knowledge/${item.id}`}
              className="block rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-bold truncate">{item.title}</p>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                    {item.content}
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {item.category && (
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        {item.category}
                      </span>
                    )}
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
