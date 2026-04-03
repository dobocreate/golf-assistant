'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Plus, Pencil } from 'lucide-react';
import { upsertClub, deleteClub } from '@/actions/club';
import { CLUB_PRESETS, type Club } from '@/features/profile/types';

function RateDisplay({ club }: { club: Club }) {
  if (club.success_rate !== null) {
    let color: string;
    if (club.success_rate >= 8) {
      color = 'text-green-600 dark:text-green-400';
    } else if (club.success_rate >= 5) {
      color = 'text-yellow-600 dark:text-yellow-400';
    } else {
      color = 'text-red-600 dark:text-red-400';
    }
    return <span className={`font-medium ${color}`}>{club.success_rate}/10</span>;
  }
  return <span className="text-gray-400">{'★'.repeat(club.confidence)}{'☆'.repeat(5 - club.confidence)}</span>;
}

function ClubRow({
  club,
  onEdit,
  onDelete,
}: {
  club: Club;
  onEdit: (club: Club) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-200 dark:border-gray-800 last:border-0">
      <span className="font-medium w-12 text-center">{club.name}</span>
      <span className="text-sm text-gray-600 dark:text-gray-400 w-20 text-right">
        {club.distance ? `${club.distance}yd` : '-'}
        {club.distance_half ? (
          <span className="block text-xs text-blue-500 dark:text-blue-400">半{club.distance_half}yd</span>
        ) : null}
      </span>
      <span className="text-sm w-12 text-center">
        <RateDisplay club={club} />
      </span>
      {club.is_weak && (
        <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded">
          苦手
        </span>
      )}
      <span className="flex-1" />
      <button
        type="button"
        onClick={() => onEdit(club)}
        className="p-2 min-h-[48px] min-w-[48px] flex items-center justify-center text-gray-400 hover:text-primary transition-colors"
        aria-label={`${club.name}を編集`}
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(club.id)}
        className="p-2 min-h-[48px] min-w-[48px] flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
        aria-label={`${club.name}を削除`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function ClubForm({
  editingClub,
  loading,
  onSubmit,
  onCancel,
}: {
  editingClub: Club | null;
  loading: boolean;
  onSubmit: (formData: FormData) => void;
  onCancel: () => void;
}) {
  const isPreset = editingClub
    ? (CLUB_PRESETS as readonly string[]).includes(editingClub.name)
    : true;
  const [isCustom, setIsCustom] = useState(editingClub ? !isPreset : false);
  const isEdit = !!editingClub;

  return (
    <form action={onSubmit} className="space-y-3 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
      {editingClub && <input type="hidden" name="id" value={editingClub.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="club-name" className="block text-sm font-medium mb-1">クラブ名</label>
          <select
            id="club-name"
            name="name"
            required
            defaultValue={editingClub ? (isPreset ? editingClub.name : '__custom__') : ''}
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
              defaultValue={editingClub && !isPreset ? editingClub.name : ''}
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
            defaultValue={editingClub?.distance ?? ''}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="club-distance-half" className="block text-sm font-medium mb-1">ハーフ飛距離(yd)</label>
          <input
            id="club-distance-half"
            name="distance_half"
            type="number"
            min="0"
            max="400"
            defaultValue={editingClub?.distance_half ?? ''}
            placeholder="6-7割の飛距離"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
        <div>
          <label htmlFor="club-success-rate" className="block text-sm font-medium mb-1">成功率(/10球)</label>
          <input
            id="club-success-rate"
            name="success_rate"
            type="number"
            min="0"
            max="10"
            defaultValue={editingClub?.success_rate ?? ''}
            placeholder="10球中の成功数"
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
            defaultValue={editingClub?.confidence ?? 3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
        <div className="flex items-end gap-2 pb-1">
          <label htmlFor="club-is-weak" className="flex items-center gap-2 text-sm">
            <input
              id="club-is-weak"
              name="is_weak"
              type="checkbox"
              value="true"
              defaultChecked={editingClub?.is_weak ?? false}
              className="h-4 w-4"
            />
            苦手クラブ
          </label>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-primary min-h-[48px] px-4 py-3 text-sm text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? (isEdit ? '更新中...' : '追加中...') : (isEdit ? '更新' : '追加')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 dark:border-gray-700 min-h-[48px] px-4 py-3 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}

export function ClubList({ clubs, profileExists }: { clubs: Club[]; profileExists: boolean }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [formState, setFormState] = useState<Club | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const editingClub = typeof formState === 'object' ? formState : null;

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await upsertClub(formData);
    if (result.error) {
      setError(result.error);
    } else {
      setFormState(null);
      router.refresh();
    }
    setLoading(false);
  }

  function handleEdit(club: Club) {
    setFormState(club);
    setError(null);
  }

  function handleCancelForm() {
    setFormState(null);
    setError(null);
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

  const formVisible = formState !== null;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Accordion header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 text-left"
      >
        <span className="text-lg font-bold">
          クラブ一覧
          {clubs.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
              ({clubs.length})
            </span>
          )}
        </span>
        <span className="text-gray-500">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="space-y-4 p-4 pt-0">
          {clubs.length > 0 ? (
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 px-4">
              {clubs.map((club) => (
                <ClubRow key={club.id} club={club} onEdit={handleEdit} onDelete={handleDelete} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 pt-4">
              クラブが登録されていません。
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          {formVisible ? (
            <ClubForm
              key={editingClub?.id ?? 'new'}
              editingClub={editingClub}
              loading={loading}
              onSubmit={handleSubmit}
              onCancel={handleCancelForm}
            />
          ) : (
            <button
              type="button"
              onClick={() => { setFormState('new'); setError(null); }}
              className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:border-primary hover:text-primary transition-colors"
            >
              <Plus className="h-4 w-4" />
              クラブを追加
            </button>
          )}
        </div>
      )}
    </div>
  );
}
