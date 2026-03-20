'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Plus } from 'lucide-react';
import { upsertClub, deleteClub } from '@/actions/club';
import { CLUB_PRESETS, type Club } from '@/features/profile/types';

function ClubRow({ club, onDelete }: { club: Club; onDelete: (id: string) => void }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-200 dark:border-gray-800 last:border-0">
      <span className="font-medium w-12 text-center">{club.name}</span>
      <span className="text-sm text-gray-600 dark:text-gray-400 w-16 text-right">
        {club.distance ? `${club.distance}yd` : '-'}
      </span>
      <span className="text-sm w-16 text-center">
        {'★'.repeat(club.confidence)}{'☆'.repeat(5 - club.confidence)}
      </span>
      {club.is_weak && (
        <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded">
          苦手
        </span>
      )}
      <span className="flex-1" />
      <button
        type="button"
        onClick={() => onDelete(club.id)}
        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
        aria-label={`${club.name}を削除`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ClubList({ clubs, profileExists }: { clubs: Club[]; profileExists: boolean }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [isCustom, setIsCustom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleAdd(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await upsertClub(formData);
    if (result.error) {
      setError(result.error);
    } else {
      setShowForm(false);
      setIsCustom(false);
      router.refresh();
    }
    setLoading(false);
  }

  async function handleDelete(clubId: string) {
    const result = await deleteClub(clubId);
    if (result.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
  }

  if (!profileExists) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        先にプロファイルを保存してからクラブを登録してください。
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {clubs.length > 0 ? (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 px-4">
          {clubs.map((club) => (
            <ClubRow key={club.id} club={club} onDelete={handleDelete} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          クラブが登録されていません。
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {showForm ? (
        <form action={handleAdd} className="space-y-3 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="club-name" className="block text-sm font-medium mb-1">クラブ名</label>
              <select
                id="club-name"
                name="name"
                required
                onChange={(e) => setIsCustom(e.target.value === '__custom__')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="">選択</option>
                {CLUB_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>{preset}</option>
                ))}
                <option value="__custom__">カスタム</option>
              </select>
              {isCustom && (
                <input
                  id="club-custom-name"
                  name="custom_name"
                  type="text"
                  required
                  placeholder="クラブ名を入力"
                  className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
                />
              )}
            </div>
            <div>
              <label htmlFor="club-distance" className="block text-sm font-medium mb-1">飛距離(yd)</label>
              <input
                id="club-distance"
                name="distance"
                type="number"
                min="0"
                max="400"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="club-confidence" className="block text-sm font-medium mb-1">自信度(1-5)</label>
              <input
                id="club-confidence"
                name="confidence"
                type="number"
                min="1"
                max="5"
                defaultValue="3"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
              />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <label htmlFor="club-is-weak" className="flex items-center gap-2 text-sm">
                <input id="club-is-weak" name="is_weak" type="checkbox" value="true" className="h-4 w-4" />
                苦手クラブ
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? '追加中...' : '追加'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setIsCustom(false); }}
              className="rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              キャンセル
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:border-primary hover:text-primary transition-colors"
        >
          <Plus className="h-4 w-4" />
          クラブを追加
        </button>
      )}
    </div>
  );
}
