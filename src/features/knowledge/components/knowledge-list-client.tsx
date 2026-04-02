'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, X, ChevronRight, Plus } from 'lucide-react';
import { KNOWLEDGE_CATEGORIES, type Knowledge, type KnowledgeCategory } from '@/features/knowledge/types';

const ALL_TAB = 'すべて';
const ITEMS_PER_PAGE = 10;

type CategoryColor = { border: string; bg: string; text: string; dot: string };

const CATEGORY_COLORS: Record<KnowledgeCategory, CategoryColor> = {
  'スイング技術': { border: 'border-l-green-500', bg: 'bg-green-50 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-300', dot: 'bg-green-500' },
  'コースマネジメント': { border: 'border-l-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  'メンタル': { border: 'border-l-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  '練習法': { border: 'border-l-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300', dot: 'bg-purple-500' },
};

const DEFAULT_COLOR: CategoryColor = { border: 'border-l-gray-400', bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', dot: 'bg-gray-400' };

function getCategoryColor(category: string | null): CategoryColor {
  if (!category) return DEFAULT_COLOR;
  return (CATEGORY_COLORS as Record<string, CategoryColor>)[category] || DEFAULT_COLOR;
}

function getCategoryCounts(items: Knowledge[]) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    if (item.category) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }
  }
  return counts;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

function groupByCategory(items: Knowledge[]) {
  const groups: { category: string; items: Knowledge[] }[] = [];
  const categoryOrder = [...KNOWLEDGE_CATEGORIES, null];
  const map = new Map<string | null, Knowledge[]>();

  for (const item of items) {
    const key = item.category;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }

  for (const cat of categoryOrder) {
    const catItems = map.get(cat);
    if (catItems && catItems.length > 0) {
      groups.push({ category: cat || 'その他', items: catItems });
    }
  }

  return groups;
}

function KnowledgeCard({ item }: { item: Knowledge }) {
  const colors = getCategoryColor(item.category);

  return (
    <Link
      href={`/knowledge/${item.id}`}
      className={`group flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 border-l-[3px] ${colors.border} bg-white dark:bg-gray-900 shadow-sm px-4 py-4 hover:border-green-400 dark:hover:border-green-600 hover:shadow-md active:scale-[0.96] transition-all`}
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-base text-gray-900 dark:text-gray-100 truncate group-hover:text-green-700 dark:group-hover:text-green-400 transition-colors">
          {item.title}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-1 leading-relaxed">
          {item.content}
        </p>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {item.category && (
            <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${colors.bg} ${colors.text}`}>
              {item.category}
            </span>
          )}
          {item.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-block px-2 py-0.5 rounded-md text-xs bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
            >
              {tag}
            </span>
          ))}
          {item.tags.length > 3 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              +{item.tags.length - 3}
            </span>
          )}
          <span className="ml-auto text-xs text-gray-300 dark:text-gray-600 shrink-0">
            {formatDate(item.updated_at)}
          </span>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-gray-300 dark:text-gray-600 group-hover:text-green-500 transition-colors" />
    </Link>
  );
}

export function KnowledgeListClient({
  allItems,
  filteredItems,
  currentCategory,
}: {
  allItems: Knowledge[];
  filteredItems: Knowledge[];
  currentCategory: string | null;
}) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  const categoryCounts = useMemo(() => getCategoryCounts(allItems), [allItems]);

  const displayItems = useMemo(() => {
    if (!searchQuery.trim()) return filteredItems;
    const q = searchQuery.toLowerCase();
    return filteredItems.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q) ||
        item.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }, [filteredItems, searchQuery]);

  const visibleItems = displayItems.slice(0, visibleCount);
  const hasMore = displayItems.length > visibleCount;

  // 全件表示（フィルタなし・検索なし）時はカテゴリ別グルーピング
  const showGrouped = !currentCategory && !searchQuery.trim();
  const groups = useMemo(
    () => (showGrouped ? groupByCategory(visibleItems) : []),
    [showGrouped, visibleItems]
  );

  function handleCategoryClick(tab: string) {
    setVisibleCount(ITEMS_PER_PAGE);
    if (tab === ALL_TAB) {
      router.push('/knowledge');
    } else {
      router.push(`/knowledge?category=${encodeURIComponent(tab)}`);
    }
  }

  const tabs = [ALL_TAB, ...KNOWLEDGE_CATEGORIES];

  return (
    <>
      {/* 検索 */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setVisibleCount(ITEMS_PER_PAGE);
          }}
          placeholder="タイトル・本文・タグで検索"
          className="w-full min-h-[48px] pl-11 pr-10 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-base placeholder:text-gray-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none transition-all"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* カテゴリタブ（フェードインジケーター付き） */}
      <div className="relative">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {tabs.map((tab) => {
            const isActive = tab === ALL_TAB ? !currentCategory : currentCategory === tab;
            const count = tab === ALL_TAB ? allItems.length : (categoryCounts[tab] || 0);
            return (
              <button
                key={tab}
                type="button"
                onClick={() => handleCategoryClick(tab)}
                className={`shrink-0 min-h-[48px] rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-green-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {tab}
                <span className={`ml-1.5 text-xs ${isActive ? 'text-green-200' : 'text-gray-400 dark:text-gray-500'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        {/* 右端フェードインジケーター */}
        <div className="absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-white dark:from-gray-950 to-transparent pointer-events-none" />
      </div>

      {/* 件数表示 */}
      <p className="text-xs text-gray-400 dark:text-gray-500">
        {searchQuery
          ? `「${searchQuery}」の検索結果: ${displayItems.length}件`
          : `${displayItems.length}件のナレッジ`}
      </p>

      {/* リスト */}
      {displayItems.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {searchQuery
              ? `「${searchQuery}」に一致するナレッジが見つかりません`
              : `「${currentCategory}」のナレッジがありません`}
          </p>
          {!searchQuery && (
            <Link
              href="/knowledge/new"
              className="inline-flex items-center justify-center mt-4 min-h-[48px] rounded-lg bg-green-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-green-700 active:scale-[0.96] transition-all"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              このカテゴリに追加
            </Link>
          )}
        </div>
      ) : showGrouped ? (
        /* カテゴリ別グルーピング表示 */
        <div className="space-y-6">
          {groups.map((group) => {
            const groupColor = getCategoryColor(group.category);
            const totalCount = categoryCounts[group.category] || group.items.length;
            return (
            <section key={group.category}>
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2.5 flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
                <span className={`h-2.5 w-2.5 rounded-full ${groupColor.dot} shrink-0`} />
                {group.category}
                <span className="text-xs font-normal text-gray-400 dark:text-gray-500">
                  {totalCount}件
                </span>
              </h2>
              <div className="space-y-2.5">
                {group.items.map((item) => (
                  <KnowledgeCard key={item.id} item={item} />
                ))}
              </div>
            </section>
            );
          })}

          {hasMore && (
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + ITEMS_PER_PAGE)}
              className="w-full min-h-[48px] rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-[0.96] transition-all"
            >
              もっと見る（残り{displayItems.length - visibleCount}件）
            </button>
          )}
        </div>
      ) : (
        /* フラットリスト表示（フィルタ/検索時） */
        <div className="space-y-2.5">
          {visibleItems.map((item) => (
            <KnowledgeCard key={item.id} item={item} />
          ))}

          {hasMore && (
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + ITEMS_PER_PAGE)}
              className="w-full min-h-[48px] rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-[0.96] transition-all"
            >
              もっと見る（残り{displayItems.length - visibleCount}件）
            </button>
          )}
        </div>
      )}
    </>
  );
}
