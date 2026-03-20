'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { upsertHole } from '@/actions/course';
import { useRouter } from 'next/navigation';
import type { Hole, HoleNote } from '@/features/course/types';
import { HoleNoteEditor } from './hole-note-editor';

interface HoleListProps {
  courseId: string;
  holes: Hole[];
  holeNotes: HoleNote[];
}

export function HoleList({ courseId, holes, holeNotes }: HoleListProps) {
  const router = useRouter();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function getNoteForHole(holeId: string): HoleNote | undefined {
    return holeNotes.find((n) => n.hole_id === holeId);
  }

  async function handleAddHole(formData: FormData) {
    setLoading(true);
    setError(null);
    formData.set('course_id', courseId);
    const result = await upsertHole(formData);
    if (result.error) {
      setError(result.error);
    } else {
      setShowAddForm(false);
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      {holes.length > 0 ? (
        <div className="space-y-2">
          {holes.map((hole) => {
            const note = getNoteForHole(hole.id);
            return (
              <div
                key={hole.id}
                className="rounded-lg border border-gray-200 dark:border-gray-800 p-4"
              >
                <div className="flex items-center gap-4 mb-2">
                  <span className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                    {hole.hole_number}
                  </span>
                  <span className="font-medium">Par {hole.par}</span>
                  {hole.distance && (
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {hole.distance}yd
                    </span>
                  )}
                  {hole.description && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {hole.description}
                    </span>
                  )}
                </div>

                {editingNote === hole.id ? (
                  <HoleNoteEditor
                    holeId={hole.id}
                    note={note}
                    onClose={() => { setEditingNote(null); router.refresh(); }}
                  />
                ) : (
                  <div className="ml-12">
                    {note?.note || note?.strategy ? (
                      <div className="text-sm space-y-1">
                        {note.strategy && (
                          <p><span className="font-medium text-primary">攻略:</span> {note.strategy}</p>
                        )}
                        {note.note && (
                          <p><span className="font-medium">メモ:</span> {note.note}</p>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingNote(hole.id)}
                          className="text-xs text-primary hover:underline"
                        >
                          編集
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingNote(hole.id)}
                        className="text-xs text-gray-400 hover:text-primary"
                      >
                        + メモを追加
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          ホール情報が登録されていません。下のボタンから追加してください。
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {showAddForm ? (
        <form action={handleAddHole} className="space-y-3 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="hole-number" className="block text-sm font-medium mb-1">ホール番号</label>
              <input
                id="hole-number"
                name="hole_number"
                type="number"
                min="1"
                max="18"
                required
                defaultValue={holes.length + 1}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
              />
            </div>
            <div>
              <label htmlFor="hole-par" className="block text-sm font-medium mb-1">Par</label>
              <select
                id="hole-par"
                name="par"
                required
                defaultValue="4"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>
            </div>
            <div>
              <label htmlFor="hole-distance" className="block text-sm font-medium mb-1">距離(yd)</label>
              <input
                id="hole-distance"
                name="distance"
                type="number"
                min="0"
                max="700"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
              />
            </div>
          </div>
          <div>
            <label htmlFor="hole-description" className="block text-sm font-medium mb-1">特徴</label>
            <input
              id="hole-description"
              name="description"
              type="text"
              placeholder="例: ドッグレッグ左、打ち下ろし"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? '保存中...' : '追加'}
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              キャンセル
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:border-primary hover:text-primary transition-colors"
        >
          <Plus className="h-4 w-4" />
          ホールを追加
        </button>
      )}
    </div>
  );
}
