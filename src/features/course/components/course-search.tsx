'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Search } from 'lucide-react';
import type { CourseSearchResult } from '@/lib/course-source/types';
import { saveCourseFromGora } from '@/actions/course';
import { useRouter } from 'next/navigation';

const GORA_SEARCH_URL = 'https://openapi.rakuten.co.jp/engine/api/Gora/GoraGolfCourseSearch/20170623';

export function CourseSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CourseSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    const appId = process.env.NEXT_PUBLIC_RAKUTEN_APP_ID;
    const accessKey = process.env.NEXT_PUBLIC_RAKUTEN_ACCESS_KEY;
    if (!appId || !accessKey) {
      setError('楽天GORA APIが設定されていません。');
      return;
    }

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const params = new URLSearchParams({
        applicationId: appId,
        accessKey,
        keyword: query.trim(),
        format: 'json',
        hits: '20',
      });

      const res = await fetch(`${GORA_SEARCH_URL}?${params}`);

      if (!res.ok) {
        setError('検索に失敗しました。');
        setLoading(false);
        return;
      }

      const data = await res.json();
      const items = data.Items ?? [];

      const mapped: CourseSearchResult[] = items.map((item: Record<string, unknown>) => {
        const golf = (item.Item ?? item) as Record<string, unknown>;
        return {
          id: String(golf.golfCourseId ?? ''),
          name: String(golf.golfCourseName ?? ''),
          prefecture: String(golf.prefecture ?? ''),
          address: String(golf.address ?? ''),
          image_url: golf.golfCourseImageUrl ? String(golf.golfCourseImageUrl) : undefined,
        };
      });

      setResults(mapped);
      if (mapped.length === 0) {
        setError('該当するコースが見つかりませんでした。');
      }
    } catch {
      setError('ネットワークエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(goraId: string) {
    setSaving(goraId);
    const result = await saveCourseFromGora(goraId);
    if (result.error) {
      setError(result.error);
    } else if (result.courseId) {
      router.push(`/courses/${result.courseId}`);
    }
    setSaving(null);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ゴルフ場名で検索"
            aria-label="ゴルフ場名で検索"
            className="w-full rounded-lg border border-gray-300 pl-10 pr-3 py-2.5 text-base dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-lg bg-primary px-5 py-2.5 text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? '検索中...' : '検索'}
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((course) => (
            <div
              key={course.id}
              className="flex items-center gap-4 rounded-lg border border-gray-200 dark:border-gray-800 p-4"
            >
              {course.image_url && (
                <Image
                  src={course.image_url}
                  alt={course.name}
                  width={96}
                  height={64}
                  className="rounded object-cover shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{course.name}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {course.prefecture} {course.address}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleSave(course.id)}
                disabled={saving === course.id}
                className="shrink-0 rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-50"
              >
                {saving === course.id ? '保存中...' : '保存'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
