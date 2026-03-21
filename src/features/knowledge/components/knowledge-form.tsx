'use client';

import { useActionState } from 'react';
import { createKnowledge, updateKnowledge } from '@/actions/knowledge';
import { KNOWLEDGE_CATEGORIES } from '@/features/knowledge/types';
import type { Knowledge } from '@/features/knowledge/types';

type Props = {
  knowledge?: Knowledge;
};

export function KnowledgeForm({ knowledge }: Props) {
  const action = knowledge ? updateKnowledge : createKnowledge;
  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string }, formData: FormData) => {
      return await action(formData);
    },
    { error: undefined as string | undefined },
  );

  const defaultTags = knowledge?.tags?.join(', ') ?? '';

  return (
    <form action={formAction} className="space-y-5">
      {knowledge && <input type="hidden" name="id" value={knowledge.id} />}

      {state?.error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
          {state.error}
        </div>
      )}

      <div>
        <label htmlFor="title" className="block text-sm font-bold mb-1">
          タイトル <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={200}
          defaultValue={knowledge?.title ?? ''}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2.5 text-base min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="例: ドライバーのスライス対策"
        />
      </div>

      <div>
        <label htmlFor="content" className="block text-sm font-bold mb-1">
          内容 <span className="text-red-500">*</span>
        </label>
        <textarea
          id="content"
          name="content"
          required
          maxLength={10000}
          rows={8}
          defaultValue={knowledge?.content ?? ''}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="ナレッジの内容を入力..."
        />
      </div>

      <div>
        <label htmlFor="category" className="block text-sm font-bold mb-1">
          カテゴリ
        </label>
        <select
          id="category"
          name="category"
          defaultValue={knowledge?.category ?? ''}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2.5 text-base min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">未分類</option>
          {KNOWLEDGE_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="tags" className="block text-sm font-bold mb-1">
          タグ
        </label>
        <input
          id="tags"
          name="tags"
          type="text"
          defaultValue={defaultTags}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2.5 text-base min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="カンマ区切りで入力（例: ドライバー, スライス）"
        />
        <p className="text-xs text-gray-500 mt-1">カンマ区切りで複数のタグを入力できます</p>
      </div>

      <div>
        <label htmlFor="source_url" className="block text-sm font-bold mb-1">
          参照URL
        </label>
        <input
          id="source_url"
          name="source_url"
          type="url"
          defaultValue={knowledge?.source_url ?? ''}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2.5 text-base min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="https://..."
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full min-h-[48px] rounded-lg bg-green-600 px-6 py-3 text-base font-bold text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? '保存中...' : knowledge ? '更新する' : '保存する'}
      </button>
    </form>
  );
}
