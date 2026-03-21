import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { getKnowledge } from '@/actions/knowledge';
import { KnowledgeDetail } from './knowledge-detail';

export default async function KnowledgeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/auth/login');

  const { id } = await params;
  const knowledge = await getKnowledge(id);
  if (!knowledge) notFound();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link
        href="/knowledge"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <ArrowLeft className="h-4 w-4" />
        ナレッジ一覧
      </Link>

      <KnowledgeDetail knowledge={knowledge} />
    </div>
  );
}
