'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Search } from 'lucide-react';
import type { CourseSearchResult } from '@/lib/course-source/types';
import { saveCourse } from '@/actions/course';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

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

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const res = await fetch(`/api/courses/search?q=${encodeURIComponent(query.trim())}`);

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? '検索に失敗しました。');
        setLoading(false);
        return;
      }

      const data = await res.json();
      const mapped: CourseSearchResult[] = data.results ?? [];

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

  async function handleSave(course: CourseSearchResult) {
    setSaving(course.id);
    const result = await saveCourse({
      goraId: course.id,
      name: course.name,
      prefecture: course.prefecture,
      address: course.address,
      imageUrl: course.image_url,
    });
    if (result.error) {
      setError(result.error);
    } else if (result.courseId) {
      router.refresh();
      router.push(`/courses/${result.courseId}`);
    }
    setSaving(null);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ゴルフ場名で検索"
            aria-label="ゴルフ場名で検索"
            className="pl-10"
          />
        </div>
        <Button
          type="submit"
          disabled={loading || !query.trim()}
          isLoading={loading}
        >
          {loading ? '検索中...' : '検索'}
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((course) => (
            <Card
              key={course.id}
              className="flex items-center gap-4"
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSave(course)}
                disabled={saving === course.id}
                isLoading={saving === course.id}
                className="shrink-0"
              >
                {saving === course.id ? '保存中...' : '保存'}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
