'use client';

import { useState, useTransition } from 'react';
import { saveReviewNote } from '@/actions/round';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
        <h2 className="text-lg font-semibold">ラウンド総括</h2>
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
          <Textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            maxLength={2000}
            rows={5}
            placeholder="今日のラウンドの振り返り、課題、次回への目標などを記入..."
            error={error ?? undefined}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">{note.length}/2000</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isPending}
                className="gap-1"
              >
                <X className="h-4 w-4" />
                キャンセル
              </Button>
              <Button
                onClick={handleSave}
                disabled={isPending}
                isLoading={isPending}
                className="gap-1 bg-blue-600 hover:bg-blue-500 active:bg-blue-700"
              >
                <Save className="h-4 w-4" />
                {isPending ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>
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
