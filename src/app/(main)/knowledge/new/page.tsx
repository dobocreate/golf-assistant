import { getAuthenticatedUser } from '@/lib/auth-utils';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { KnowledgeForm } from '@/features/knowledge/components/knowledge-form';

export default async function NewKnowledgePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/auth/login');

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link
        href="/knowledge"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <ArrowLeft className="h-4 w-4" />
        ナレッジ一覧
      </Link>

      <h1 className="text-2xl font-bold">ナレッジを追加</h1>

      <KnowledgeForm />
    </div>
  );
}
