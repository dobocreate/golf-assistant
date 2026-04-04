'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteKnowledge } from '@/actions/knowledge';
import { Button } from '@/components/ui/button';

export function DeleteKnowledgeButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button
        variant="outline"
        onClick={() => setConfirming(true)}
        className="border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
      >
        <Trash2 className="h-4 w-4 mr-1.5" />
        削除
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-red-600 dark:text-red-400">本当に削除しますか？</span>
      <Button
        variant="danger"
        isLoading={isPending}
        onClick={() => {
          startTransition(async () => {
            await deleteKnowledge(id);
          });
        }}
      >
        {isPending ? '削除中...' : '削除する'}
      </Button>
      <Button variant="outline" onClick={() => setConfirming(false)}>
        キャンセル
      </Button>
    </div>
  );
}
