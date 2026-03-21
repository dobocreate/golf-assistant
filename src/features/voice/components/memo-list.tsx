'use client';

import { useState, useTransition, useCallback, useEffect } from 'react';
import { Trash2, Mic, FileText } from 'lucide-react';
import { deleteMemo, getMemos, type Memo } from '@/actions/memo';

interface MemoListProps {
  roundId: string;
  holeNumber: number;
  refreshKey?: number;
}

export function MemoList({ roundId, holeNumber, refreshKey }: MemoListProps) {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const fetchMemos = useCallback(async () => {
    setIsLoading(true);
    const allMemos = await getMemos(roundId);
    const holeMemos = allMemos.filter(m => m.hole_number === holeNumber);
    setMemos(holeMemos);
    setIsLoading(false);
  }, [roundId, holeNumber]);

  useEffect(() => {
    fetchMemos();
  }, [fetchMemos, refreshKey]);

  const handleDelete = useCallback((memoId: string) => {
    const previousMemos = memos;
    setMemos(prev => prev.filter(m => m.id !== memoId));

    startTransition(async () => {
      const result = await deleteMemo(memoId);
      if (result.error) {
        // ロールバック
        setMemos(previousMemos);
      }
    });
  }, [memos]);

  if (isLoading) return null;
  if (memos.length === 0) return null;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-bold text-gray-300">
        メモ ({memos.length})
      </label>
      <div className="space-y-1">
        {memos.map(memo => (
          <div
            key={memo.id}
            className="flex items-start gap-2 rounded-lg bg-gray-800 p-2"
          >
            <div className="mt-0.5 text-gray-500">
              {memo.source === 'voice' ? (
                <Mic className="h-3.5 w-3.5" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
            </div>
            <p className="flex-1 text-sm text-gray-300 break-all">{memo.content}</p>
            <button
              onClick={() => handleDelete(memo.id)}
              disabled={isPending}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-gray-700 disabled:opacity-50 transition-colors"
              aria-label="メモを削除"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
