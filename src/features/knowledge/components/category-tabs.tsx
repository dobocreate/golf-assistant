'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { KNOWLEDGE_CATEGORIES } from '@/features/knowledge/types';

const ALL_TAB = 'すべて';

export function CategoryTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get('category') ?? '';

  const tabs = [ALL_TAB, ...KNOWLEDGE_CATEGORIES];

  function handleClick(tab: string) {
    if (tab === ALL_TAB) {
      router.push('/knowledge');
    } else {
      router.push(`/knowledge?category=${encodeURIComponent(tab)}`);
    }
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {tabs.map((tab) => {
        const isActive = tab === ALL_TAB ? !current : current === tab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => handleClick(tab)}
            className={`shrink-0 min-h-[40px] rounded-full px-4 py-2 text-sm font-bold transition-colors ${
              isActive
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}
