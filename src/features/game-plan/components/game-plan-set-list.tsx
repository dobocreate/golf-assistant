'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import { createGamePlanSet, deleteGamePlanSet } from '@/actions/game-plan-set';
import type { GamePlanSet } from '@/features/game-plan/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
        <Button
          onClick={() => setShowCreateForm(true)}
          variant="outline"
          size="md"
          fullWidth
          className="gap-2 border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 hover:border-green-500 hover:text-green-600"
        >
          <Plus className="h-5 w-5" />
          新しいプランを作成
        </Button>
      ) : (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <h3 className="text-sm font-semibold">新しいプランを作成</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">コース</label>
            <select
              value={selectedCourseId}
              onChange={e => setSelectedCourseId(e.target.value)}
              className="w-full min-h-[48px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-base text-gray-900 dark:text-gray-200 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              <option value="">選択してください</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <Input
            label="プラン名"
            type="text"
            value={planName}
            onChange={e => setPlanName(e.target.value)}
            placeholder="例: 攻めプラン、安全プラン"
            maxLength={100}
            inputSize="sm"
          />

          <Input
            label="目標スコア（任意）"
            type="number"
            min={50}
            max={200}
            value={targetScore}
            onChange={e => setTargetScore(e.target.value)}
            placeholder="例: 92"
            inputSize="sm"
            className="w-32"
          />

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex gap-2">
            <Button
              onClick={handleCreate}
              disabled={isPending || !selectedCourseId || !planName.trim()}
              variant="primary"
              size="md"
              isLoading={isPending}
              className="flex-1 gap-2 font-bold"
            >
              <Plus className="h-4 w-4" />
              作成
            </Button>
            <Button
              onClick={() => { setShowCreateForm(false); setError(''); }}
              variant="ghost"
              size="md"
              className="text-gray-500"
            >
              キャンセル
            </Button>
          </div>
        </div>
      )}

      {/* プラン一覧（コース別） */}
      {sets.length === 0 && !showCreateForm && (
        <p className="text-center text-gray-400 py-8">まだプランがありません</p>
      )}

      {Array.from(grouped.entries()).map(([courseId, { courseName, plans }]) => (
        <div key={courseId} className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-500">{courseName}</h3>
          {plans.map(plan => (
            <div
              key={plan.id}
              className="rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <Link href={`/game-plans/${plan.id}`} className="flex-1 min-w-0">
                <p className="font-bold truncate">{plan.name}</p>
                <p className="text-xs text-gray-500">
                  {plan.target_score ? `目標: ${plan.target_score}` : '目標未設定'}
                </p>
              </Link>
              <Button
                onClick={() => handleDelete(plan.id)}
                disabled={isPending}
                variant="ghost"
                size="sm"
                className="min-h-[48px] min-w-[48px] text-gray-400 hover:text-red-500"
                aria-label="プランを削除"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
