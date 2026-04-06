'use client';

import { useState, useTransition } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { addCompanion, deleteCompanion } from '@/actions/companion';
import type { Companion } from '@/features/score/types';

interface CompanionManagerProps {
  roundId: string;
  initialCompanions: Companion[];
}

export function CompanionManager({ roundId, initialCompanions }: CompanionManagerProps) {
  const [companions, setCompanions] = useState(initialCompanions);
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    if (!name.trim()) return;
    startTransition(async () => {
      const result = await addCompanion(roundId, name);
      if (result.error) {
        setError(result.error);
      } else if (result.companion) {
        setCompanions(prev => [...prev, result.companion!]);
        setName('');
        setError(null);
      }
    });
  }

  function handleDelete(companionId: string, companionName: string) {
    if (!window.confirm(`${companionName}を削除しますか？スコアも全て削除されます。`)) return;
    startTransition(async () => {
      const result = await deleteCompanion(roundId, companionId);
      if (result.error) {
        setError(result.error);
      } else {
        setCompanions(prev => prev.filter(c => c.id !== companionId));
        setError(null);
      }
    });
  }

  return (
    <div className="rounded-lg border border-gray-700 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls="companion-manager-panel"
        className="w-full flex items-center justify-between p-3 bg-gray-800 text-left"
      >
        <span className="text-base font-bold text-white">
          同伴者
          {companions.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-400">
              ({companions.length})
            </span>
          )}
        </span>
        <span className="text-gray-400">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div id="companion-manager-panel" role="region" className="p-4 space-y-3 bg-gray-900">
          {companions.length > 0 ? (
            <div className="space-y-2">
              {companions.map(c => (
                <div key={c.id} className="flex items-center justify-between rounded-lg bg-gray-800 px-4 py-2">
                  <span className="text-gray-200 font-medium">{c.name}</span>
                  <button
                    onClick={() => handleDelete(c.id, c.name)}
                    disabled={isPending}
                    className="p-2 min-h-[48px] min-w-[48px] flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    aria-label={`${c.name}を削除`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">同伴者が登録されていません。</p>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-400">{error}</p>
          )}

          {companions.length < 3 && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder="名前を入力"
                maxLength={20}
                className="flex-1 min-h-[48px] rounded-lg bg-gray-800 text-gray-200 px-3 text-base border-0 focus:ring-2 focus:ring-green-600"
              />
              <button
                onClick={handleAdd}
                disabled={!name.trim() || isPending}
                className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-lg bg-green-600 text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
                aria-label="同伴者を追加"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
