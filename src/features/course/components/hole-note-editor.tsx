'use client';

import { useState } from 'react';
import { upsertHoleNote } from '@/actions/course';
import type { HoleNote } from '@/features/course/types';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

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
      <Input
        label="攻略法"
        name="strategy"
        type="text"
        defaultValue={note?.strategy ?? ''}
        placeholder="例: グリーン手前から攻める"
        inputSize="sm"
      />
      <Textarea
        label="メモ・注意点"
        name="note"
        rows={2}
        defaultValue={note?.note ?? ''}
        placeholder="例: 右OBに注意、左足下がりのライ"
        className="text-sm"
      />
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          isLoading={loading}
        >
          {loading ? '保存中...' : '保存'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
        >
          キャンセル
        </Button>
      </div>
    </form>
  );
}
