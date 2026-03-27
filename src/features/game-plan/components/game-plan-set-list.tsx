'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { createGamePlanSet, deleteGamePlanSet } from '@/actions/game-plan-set';
import type { GamePlanSet } from '@/features/game-plan/types';

interface Course {
  id: string;
  name: string;
}

interface GamePlanSetListProps {
  sets: (GamePlanSet & { course_name: string })[];
  courses: Course[];
}

export function GamePlanSetList({ sets, courses }: GamePlanSetListProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [planName, setPlanName] = useState('');
  const [targetScore, setTargetScore] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const handleCreate = () => {
    if (!selectedCourseId || !planName.trim()) return;
    startTransition(async () => {
      setError('');
      const ts = targetScore ? parseInt(targetScore, 10) : null;
      const result = await createGamePlanSet({
        courseId: selectedCourseId,
        name: planName.trim(),
        targetScore: ts,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setShowCreateForm(false);
      setPlanName('');
      setTargetScore('');
      setSelectedCourseId('');
    });
  };

  const handleDelete = (setId: string) => {
    if (!confirm('このプランを削除しますか？')) return;
    startTransition(async () => {
      await deleteGamePlanSet(setId);
    });
  };

  // コース別にグループ化
  const grouped = new Map<string, { courseName: string; plans: (GamePlanSet & { course_name: string })[] }>();
  for (const s of sets) {
    const existing = grouped.get(s.course_id);
    if (existing) {
      existing.plans.push(s);
    } else {
      grouped.set(s.course_id, { courseName: s.course_name, plans: [s] });
    }
  }

  return (
    <div className="space-y-4">
      {/* 新規作成ボタン */}
      {!showCreateForm ? (
        <button
          onClick={() => setShowCreateForm(true)}
          className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 hover:border-green-500 hover:text-green-600 transition-colors"
        >
          <Plus className="h-5 w-5" />
          新しいプランを作成
        </button>
      ) : (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <h3 className="text-sm font-bold">新しいプランを作成</h3>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">コース</label>
            <select
              value={selectedCourseId}
              onChange={e => setSelectedCourseId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
            >
              <option value="">選択してください</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">プラン名</label>
            <input
              type="text"
              value={planName}
              onChange={e => setPlanName(e.target.value)}
              placeholder="例: 攻めプラン、安全プラン"
              maxLength={100}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">目標スコア（任意）</label>
            <input
              type="number"
              min={50}
              max={200}
              value={targetScore}
              onChange={e => setTargetScore(e.target.value)}
              placeholder="例: 92"
              className="w-32 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={isPending || !selectedCourseId || !planName.trim()}
              className="min-h-[48px] flex-1 flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              作成
            </button>
            <button
              onClick={() => { setShowCreateForm(false); setError(''); }}
              className="min-h-[48px] px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* プラン一覧（コース別） */}
      {sets.length === 0 && !showCreateForm && (
        <p className="text-center text-gray-400 py-8">まだプランがありません</p>
      )}

      {Array.from(grouped.entries()).map(([courseId, { courseName, plans }]) => (
        <div key={courseId} className="space-y-2">
          <h3 className="text-sm font-bold text-gray-500">{courseName}</h3>
          {plans.map(plan => (
            <div
              key={plan.id}
              className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <Link href={`/game-plans/${plan.id}`} className="flex-1 min-w-0">
                <p className="font-bold truncate">{plan.name}</p>
                <p className="text-xs text-gray-500">
                  {plan.target_score ? `目標: ${plan.target_score}` : '目標未設定'}
                </p>
              </Link>
              <button
                onClick={() => handleDelete(plan.id)}
                disabled={isPending}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                aria-label="プランを削除"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
