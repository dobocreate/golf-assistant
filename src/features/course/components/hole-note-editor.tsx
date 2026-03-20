'use client';

import { useState } from 'react';
import { upsertHoleNote } from '@/actions/course';
import type { HoleNote } from '@/features/course/types';

interface HoleNoteEditorProps {
  holeId: string;
  note: HoleNote | undefined;
  onClose: () => void;
}

export function HoleNoteEditor({ holeId, note, onClose }: HoleNoteEditorProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    formData.set('hole_id', holeId);
    const result = await upsertHoleNote(formData);
    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      onClose();
    }
  }

  return (
    <form action={handleSubmit} className="ml-12 space-y-2 mt-2">
      <div>
        <label htmlFor={`strategy-${holeId}`} className="block text-xs font-medium mb-1">
          攻略法
        </label>
        <input
          id={`strategy-${holeId}`}
          name="strategy"
          type="text"
          defaultValue={note?.strategy ?? ''}
          placeholder="例: グリーン手前から攻める"
          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
      </div>
      <div>
        <label htmlFor={`note-${holeId}`} className="block text-xs font-medium mb-1">
          メモ・注意点
        </label>
        <textarea
          id={`note-${holeId}`}
          name="note"
          rows={2}
          defaultValue={note?.note ?? ''}
          placeholder="例: 右OBに注意、左足下がりのライ"
          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? '保存中...' : '保存'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}
