'use client';

import { useState } from 'react';
import { Pencil, ExternalLink } from 'lucide-react';
import type { Knowledge } from '@/features/knowledge/types';
import { KnowledgeForm } from '@/features/knowledge/components/knowledge-form';
import { DeleteKnowledgeButton } from '@/features/knowledge/components/delete-knowledge-button';
import { Button } from '@/components/ui/button';

export function KnowledgeDetail({ knowledge }: { knowledge: Knowledge }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">ナレッジを編集</h1>
          <Button variant="outline" onClick={() => setEditing(false)}>
            キャンセル
          </Button>
        </div>
        <KnowledgeForm knowledge={knowledge} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{knowledge.title}</h1>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {knowledge.category && (
            <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              {knowledge.category}
            </span>
          )}
          {knowledge.tags.map((tag) => (
            <span
              key={tag}
              className="inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            >
              {tag}
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          更新: {new Date(knowledge.updated_at).toLocaleDateString('ja-JP')}
        </p>
      </div>

      <div className="prose prose-sm dark:prose-invert max-w-none">
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {knowledge.content}
        </div>
      </div>

      {knowledge.source_url && (
        <a
          href={knowledge.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          参照元を開く
        </a>
      )}

      <div className="flex items-center gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button onClick={() => setEditing(true)}>
          <Pencil className="h-4 w-4 mr-1.5" />
          編集
        </Button>
        <DeleteKnowledgeButton id={knowledge.id} />
      </div>
    </div>
  );
}
