'use client';

import { useState, useTransition } from 'react';
import { deleteRound } from '@/actions/round';
import { Trash2 } from 'lucide-react';

interface DeleteRoundButtonProps {
  roundId: string;
}

export function DeleteRoundButton({ roundId }: DeleteRoundButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteRound(roundId);
      if (result?.error) {
        setError(result.error);
        setShowConfirm(false);
      }
    });
  };

  if (showConfirm) {
    return (
      <div className="space-y-2">
        <div className="rounded-lg border border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/20 p-3">
          <p className="text-sm text-red-800 dark:text-red-200">このラウンドを削除しますか？スコア、ショット記録、メモがすべて削除されます。この操作は取り消せません。</p>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              disabled={isPending}
              className="min-h-[48px] rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="min-h-[48px] rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50"
            >
              {isPending ? '削除中...' : '削除する'}
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setShowConfirm(true)}
      className="inline-flex items-center justify-center gap-2 min-h-[48px] rounded-lg border border-red-300 dark:border-red-600 px-6 py-3 text-lg font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
    >
      <Trash2 className="h-5 w-5" />
      削除
    </button>
  );
}
