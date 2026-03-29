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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-sm rounded-lg border border-red-300 dark:border-red-600 bg-white dark:bg-gray-800 p-4 shadow-xl">
          <p className="text-sm text-red-800 dark:text-red-200">このラウンドを削除しますか？スコア、ショット記録、メモがすべて削除されます。この操作は取り消せません。</p>
          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              disabled={isPending}
              className="flex-1 min-h-[48px] rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="flex-1 min-h-[48px] rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50"
            >
              {isPending ? '削除中...' : '削除する'}
            </button>
          </div>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setShowConfirm(true)}
      className="min-h-[48px] flex items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-bold text-white shadow-lg hover:bg-red-500 transition-colors"
    >
      <Trash2 className="h-4 w-4" />
      削除
    </button>
  );
}
