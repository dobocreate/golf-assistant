'use client';

import { useActionState } from 'react';
import { upsertProfile } from '@/actions/profile';
import { PLAY_STYLES, SHOT_SHAPES, SCORE_LEVELS, type Profile } from '@/features/profile/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type FormState =
  | { success: true; error?: never }
  | { error: string; success?: never }
  | {};

async function profileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await upsertProfile(formData);
  if (result.error) return { error: result.error };
  return { success: true };
}

export function ProfileForm({ profile }: { profile: Profile | null }) {
  const [state, action, isPending] = useActionState(profileAction, {});

  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="ハンディキャップ"
          name="handicap"
          type="number"
          step="0.1"
          min="0"
          max="54"
          defaultValue={profile?.handicap ?? ''}
        />

        <Select
          label="プレースタイル"
          name="play_style"
          defaultValue={profile?.play_style ?? ''}
        >
          <option value="">選択してください</option>
          {PLAY_STYLES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="持ち球"
          name="shot_shape"
          defaultValue={profile?.shot_shape ?? ''}
        >
          <option value="">選択してください</option>
          {SHOT_SHAPES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>

        <Select
          label="スコアレベル"
          name="score_level"
          defaultValue={profile?.score_level ?? ''}
        >
          <option value="">選択してください</option>
          {SCORE_LEVELS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>

      <Textarea
        label="ミス傾向"
        name="miss_tendency"
        rows={2}
        defaultValue={profile?.miss_tendency ?? ''}
        placeholder="例: 力むとフック、打ち下ろしでスライス"
      />

      <Textarea
        label="疲労時の傾向"
        name="fatigue_note"
        rows={2}
        defaultValue={profile?.fatigue_note ?? ''}
        placeholder="例: 後半に飛距離が落ちる、集中力低下でパットが雑になる"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="得意なショット"
          name="favorite_shot"
          type="text"
          defaultValue={profile?.favorite_shot ?? ''}
          placeholder="例: 100yd以内のアプローチ"
        />

        <Input
          label="得意な距離帯"
          name="favorite_distance"
          type="text"
          defaultValue={profile?.favorite_distance ?? ''}
          placeholder="例: 80〜120yd"
        />
      </div>

      <Textarea
        label="状況別の傾向（自由記述）"
        name="situation_notes"
        rows={3}
        defaultValue={profile?.situation_notes ?? ''}
        placeholder="例: バンカーが苦手、打ち上げではクラブ1番手上げる"
      />

      {'error' in state && state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {'success' in state && state.success && !isPending && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          プロファイルを保存しました。
        </p>
      )}

      <Button type="submit" variant="primary" size="lg" isLoading={isPending}>
        {isPending ? '保存中...' : '保存'}
      </Button>
    </form>
  );
}
