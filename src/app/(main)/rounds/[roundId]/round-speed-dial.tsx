'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { SpeedDial } from '@/components/ui/speed-dial';
import { deleteRound } from '@/actions/round';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';

export function RoundSpeedDial({ roundId }: { roundId: string }) {
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

  return (
    <>
      <SpeedDial
        actions={[
          {
            key: 'edit',
            icon: <Pencil className="h-4 w-4" />,
            label: '編集',
            href: `/play/${roundId}/score?edit=1`,
            variant: 'primary',
          },
          {
            key: 'delete',
            icon: <Trash2 className="h-4 w-4" />,
            label: '削除',
            onClick: () => setShowConfirm(true),
            variant: 'danger',
          },
        ]}
      />

      {/* 削除確認モーダル */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg border border-red-300 dark:border-red-600 bg-white dark:bg-gray-800 p-4 shadow-xl">
            <p className="text-sm text-red-800 dark:text-red-200">
              このラウンドを削除しますか？スコア、ショット記録、メモがすべて削除されます。この操作は取り消せません。
            </p>
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
      )}
    </>
  );
}
