import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect } from 'next/navigation';
import { BookOpen, Plus } from 'lucide-react';
import { getKnowledgeList } from '@/actions/knowledge';
import { KnowledgeListClient } from '@/features/knowledge/components/knowledge-list-client';
import { ButtonLink } from '@/components/ui/button';
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
        <ButtonLink href="/knowledge/new">
          <Plus className="h-4 w-4 mr-1.5" />
          追加
        </ButtonLink>
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
          <ButtonLink href="/knowledge/new">
            <Plus className="h-4 w-4 mr-2" />
            最初のナレッジを追加
          </ButtonLink>
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
