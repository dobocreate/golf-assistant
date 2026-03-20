'use client';

import { useState } from 'react';
import { upsertProfile } from '@/actions/profile';
import { PLAY_STYLES, type Profile } from '@/features/profile/types';

export function ProfileForm({ profile }: { profile: Profile | null }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    setSuccess(false);
    const result = await upsertProfile(formData);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="handicap" className="block text-sm font-medium mb-1">
            ハンディキャップ
          </label>
          <input
            id="handicap"
            name="handicap"
            type="number"
            step="0.1"
            min="0"
            max="54"
            defaultValue={profile?.handicap ?? ''}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
          />
        </div>

        <div>
          <label htmlFor="play_style" className="block text-sm font-medium mb-1">
            プレースタイル
          </label>
          <select
            id="play_style"
            name="play_style"
            defaultValue={profile?.play_style ?? ''}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="">選択してください</option>
            {PLAY_STYLES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="miss_tendency" className="block text-sm font-medium mb-1">
          ミス傾向
        </label>
        <textarea
          id="miss_tendency"
          name="miss_tendency"
          rows={2}
          defaultValue={profile?.miss_tendency ?? ''}
          placeholder="例: 力むとフック、打ち下ろしでスライス"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
        />
      </div>

      <div>
        <label htmlFor="fatigue_note" className="block text-sm font-medium mb-1">
          疲労時の傾向
        </label>
        <textarea
          id="fatigue_note"
          name="fatigue_note"
          rows={2}
          defaultValue={profile?.fatigue_note ?? ''}
          placeholder="例: 後半に飛距離が落ちる、集中力低下でパットが雑になる"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="favorite_shot" className="block text-sm font-medium mb-1">
            得意なショット
          </label>
          <input
            id="favorite_shot"
            name="favorite_shot"
            type="text"
            defaultValue={profile?.favorite_shot ?? ''}
            placeholder="例: 100yd以内のアプローチ"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
          />
        </div>

        <div>
          <label htmlFor="favorite_distance" className="block text-sm font-medium mb-1">
            得意な距離帯
          </label>
          <input
            id="favorite_distance"
            name="favorite_distance"
            type="text"
            defaultValue={profile?.favorite_distance ?? ''}
            placeholder="例: 80〜120yd"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
      </div>

      <div>
        <label htmlFor="situation_notes" className="block text-sm font-medium mb-1">
          状況別の傾向（自由記述）
        </label>
        <textarea
          id="situation_notes"
          name="situation_notes"
          rows={3}
          defaultValue={profile?.situation_notes ?? ''}
          placeholder="例: バンカーが苦手、打ち上げではクラブ1番手上げる"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      {success && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          プロファイルを保存しました。
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-primary px-6 py-2.5 text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {loading ? '保存中...' : '保存'}
      </button>
    </form>
  );
}
