'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteKnowledge } from '@/actions/knowledge';

export function DeleteKnowledgeButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1.5 min-h-[48px] rounded-lg border border-red-300 dark:border-red-700 px-4 py-2.5 text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
      >
        <Trash2 className="h-4 w-4" />
        削除
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-red-600 dark:text-red-400">本当に削除しますか？</span>
      <button
        type="button"
        onClick={() => {
          startTransition(async () => {
            await deleteKnowledge(id);
          });
        }}
        disabled={isPending}
        className="min-h-[48px] rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
      >
        {isPending ? '削除中...' : '削除する'}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="min-h-[48px] rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-bold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        キャンセル
      </button>
    </div>
  );
}
