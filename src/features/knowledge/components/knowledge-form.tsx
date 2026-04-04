'use client';

import { useActionState } from 'react';
import { createKnowledge, updateKnowledge } from '@/actions/knowledge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
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

      <Input
        label="タイトル *"
        name="title"
        required
        maxLength={200}
        defaultValue={knowledge?.title ?? ''}
        placeholder="例: ドライバーのスライス対策"
      />

      <Textarea
        label="内容 *"
        name="content"
        required
        maxLength={10000}
        rows={8}
        defaultValue={knowledge?.content ?? ''}
        placeholder="ナレッジの内容を入力..."
      />

      <Select
        label="カテゴリ"
        name="category"
        defaultValue={knowledge?.category ?? ''}
      >
        <option value="">未分類</option>
        {KNOWLEDGE_CATEGORIES.map((cat) => (
          <option key={cat} value={cat}>
            {cat}
          </option>
        ))}
      </Select>

      <div>
        <Input
          label="タグ"
          name="tags"
          defaultValue={defaultTags}
          placeholder="カンマ区切りで入力（例: ドライバー, スライス）"
        />
        <p className="text-xs text-gray-500 mt-1">カンマ区切りで複数のタグを入力できます</p>
      </div>

      <Input
        label="参照URL"
        name="source_url"
        type="url"
        defaultValue={knowledge?.source_url ?? ''}
        placeholder="https://..."
      />

      <Button
        type="submit"
        fullWidth
        size="lg"
        isLoading={isPending}
        disabled={isPending}
      >
        {isPending ? '保存中...' : knowledge ? '更新する' : '保存する'}
      </Button>
    </form>
  );
}
