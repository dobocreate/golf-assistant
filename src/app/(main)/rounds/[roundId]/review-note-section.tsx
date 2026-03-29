'use client';

import { useState, useTransition } from 'react';
import { saveReviewNote } from '@/actions/round';
import { Pencil, Save, X } from 'lucide-react';

interface ReviewNoteSectionProps {
  roundId: string;
  initialNote: string | null;
}

export function ReviewNoteSection({ roundId, initialNote }: ReviewNoteSectionProps) {
  const [note, setNote] = useState(initialNote ?? '');
  const [isEditing, setIsEditing] = useState(false);
  const [savedNote, setSavedNote] = useState(initialNote);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveReviewNote(roundId, note);
      if (result.error) {
        setError(result.error);
      } else {
        setSavedNote(note || null);
        setIsEditing(false);
      }
    });
  };

  const handleCancel = () => {
    setNote(savedNote ?? '');
    setIsEditing(false);
    setError(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">ラウンド総括</h2>
        {!isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-500"
          >
            <Pencil className="h-4 w-4" />
            {savedNote ? '編集' : '総括を書く'}
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            maxLength={2000}
            rows={5}
            placeholder="今日のラウンドの振り返り、課題、次回への目標などを記入..."
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">{note.length}/2000</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isPending}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-600 min-h-[48px] px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="h-4 w-4" />
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 min-h-[48px] px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {isPending ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      ) : savedNote ? (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-sm whitespace-pre-wrap">{savedNote}</p>
        </div>
      ) : (
        <p className="text-sm text-gray-400">総括がまだ記入されていません</p>
      )}
    </div>
  );
}
