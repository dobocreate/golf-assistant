'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { startRound } from '@/actions/round';
import type { Course } from '@/features/course/types';

interface RoundStartFormProps {
  courses: Course[];
  selectedCourseId?: string;
}

export function RoundStartForm({ courses, selectedCourseId }: RoundStartFormProps) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await startRound(formData);
      // redirect() throws so this only runs on error
      return result ?? {};
    },
    null
  );

  const today = new Date().toISOString().split('T')[0];

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
          defaultValue={selectedCourseId || ''}
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
