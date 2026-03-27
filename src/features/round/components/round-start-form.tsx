'use client';

import { useState, useActionState, useMemo } from 'react';
import Link from 'next/link';
import { startRound } from '@/actions/round';
import type { Course } from '@/features/course/types';
import type { GamePlanSet } from '@/features/game-plan/types';

interface RoundStartFormProps {
  courses: Course[];
  selectedCourseId?: string;
  gamePlanSets?: (GamePlanSet & { course_name: string })[];
}

export function RoundStartForm({ courses, selectedCourseId, gamePlanSets = [] }: RoundStartFormProps) {
  const [courseId, setCourseId] = useState(selectedCourseId || '');
  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await startRound(formData);
      return result ?? {};
    },
    null
  );

  const today = new Date().toISOString().split('T')[0];

  // 選択中コースのプラン一覧
  const availablePlans = useMemo(
    () => gamePlanSets.filter(s => s.course_id === courseId),
    [gamePlanSets, courseId],
  );

  if (courses.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-300 text-lg mb-4">
          保存済みのコースがありません
        </p>
        <Link
          href="/courses"
          className="inline-flex items-center justify-center min-h-[48px] rounded-lg bg-green-600 px-6 py-3 text-lg font-bold text-white hover:bg-green-500 transition-colors"
        >
          コースを検索・保存する
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {state && state.error && (
        <div className="rounded-lg bg-red-900/50 border border-red-700 p-4 text-red-200">
          {state.error}
        </div>
      )}

      {/* コース選択 */}
      <div className="space-y-2">
        <label htmlFor="course_id" className="block text-lg font-bold text-gray-200">
          コース選択
        </label>
        <select
          id="course_id"
          name="course_id"
          value={courseId}
          onChange={e => setCourseId(e.target.value)}
          required
          className="w-full min-h-[48px] rounded-lg bg-gray-800 border border-gray-600 text-white text-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        >
          <option value="" disabled>
            コースを選択してください
          </option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}（{course.prefecture}）
            </option>
          ))}
        </select>
      </div>

      {/* ゲームプラン選択 */}
      {courseId && availablePlans.length > 0 && (
        <div className="space-y-2">
          <label htmlFor="game_plan_set_id" className="block text-lg font-bold text-gray-200">
            ゲームプラン
          </label>
          <select
            id="game_plan_set_id"
            name="game_plan_set_id"
            defaultValue=""
            className="w-full min-h-[48px] rounded-lg bg-gray-800 border border-gray-600 text-white text-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="">プランなし</option>
            {availablePlans.map(plan => (
              <option key={plan.id} value={plan.id}>
                {plan.name}{plan.target_score ? ` （目標: ${plan.target_score}）` : ''}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400">
            選択するとプレー中にアラート＋プランが表示されます
          </p>
        </div>
      )}

      {/* プラン未登録時の案内 */}
      {courseId && availablePlans.length === 0 && (
        <div className="rounded-lg border border-gray-700 p-3">
          <p className="text-sm text-gray-400">
            このコースのゲームプランはまだありません。
            <Link href="/game-plans" className="text-green-400 hover:text-green-300 ml-1">
              プランを作成
            </Link>
          </p>
        </div>
      )}

      {/* スタートコース */}
      <div className="space-y-2">
        <label className="block text-lg font-bold text-gray-200">
          スタート
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center justify-center min-h-[48px] rounded-lg bg-gray-800 border border-gray-600 text-white text-lg px-4 py-3 cursor-pointer has-[:checked]:bg-green-600 has-[:checked]:border-green-500 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-green-400 transition-colors">
            <input type="radio" name="starting_course" value="out" defaultChecked className="sr-only" />
            OUT
          </label>
          <label className="flex items-center justify-center min-h-[48px] rounded-lg bg-gray-800 border border-gray-600 text-white text-lg px-4 py-3 cursor-pointer has-[:checked]:bg-green-600 has-[:checked]:border-green-500 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-green-400 transition-colors">
            <input type="radio" name="starting_course" value="in" className="sr-only" />
            IN
          </label>
        </div>
      </div>

      {/* プレー日 */}
      <div className="space-y-2">
        <label htmlFor="played_at" className="block text-lg font-bold text-gray-200">
          プレー日
        </label>
        <input
          type="date"
          id="played_at"
          name="played_at"
          defaultValue={today}
          className="w-full min-h-[48px] rounded-lg bg-gray-800 border border-gray-600 text-white text-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
      </div>

      {/* 開始ボタン */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full min-h-[56px] rounded-lg bg-green-600 px-8 py-4 text-xl font-bold text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? 'ラウンド作成中...' : 'ラウンド開始'}
      </button>
    </form>
  );
}
