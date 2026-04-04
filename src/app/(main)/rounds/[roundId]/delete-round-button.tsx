'use client';

import { useState, useTransition } from 'react';
import { deleteRound } from '@/actions/round';
import { Button } from '@/components/ui/button';
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
            <Button
              variant="outline"
              onClick={() => setShowConfirm(false)}
              disabled={isPending}
              fullWidth
            >
              キャンセル
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={isPending}
              isLoading={isPending}
              fullWidth
            >
              {isPending ? '削除中...' : '削除する'}
            </Button>
          </div>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <Button
      variant="danger"
      onClick={() => setShowConfirm(true)}
      className="rounded-full gap-2 px-5 shadow-lg"
    >
      <Trash2 className="h-4 w-4" />
      削除
    </Button>
  );
}
