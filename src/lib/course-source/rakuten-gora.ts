import type { CourseSource, CourseSearchResult, CourseDetail } from './types';

const GORA_BASE = 'https://openapi.rakuten.co.jp/engine/api/Gora';
const API_VERSION = '20170623';

export function createRakutenGoraSource(appId: string, accessKey: string): CourseSource {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://golf-assistant.vercel.app';

  return {
    async search(query: string, _prefecture?: string): Promise<CourseSearchResult[]> {
      try {
        const params = new URLSearchParams({
          applicationId: appId,
          accessKey,
          keyword: query,
          format: 'json',
          hits: '20',
        });

        const res = await fetch(
          `${GORA_BASE}/GoraGolfCourseSearch/${API_VERSION}?${params}`,
          {
            next: { revalidate: 3600 },
            headers: {
              'Referer': siteUrl,
              'Origin': siteUrl,
            },
          }
        );

        if (!res.ok) {
          console.error('Rakuten GORA search failed:', res.status, await res.text());
          return [];
        }

        const data = await res.json();
        const items = data.Items ?? [];

        return items.map((item: Record<string, unknown>) => {
          const golf = (item.Item ?? item) as Record<string, unknown>;
          return {
            id: String(golf.golfCourseId ?? ''),
            name: String(golf.golfCourseName ?? ''),
            prefecture: String(golf.prefecture ?? ''),
            address: String(golf.address ?? ''),
            image_url: golf.golfCourseImageUrl ? String(golf.golfCourseImageUrl) : undefined,
          };
        });
      } catch (error) {
        console.error('Rakuten GORA search error:', error);
        return [];
      }
    },

    async getDetail(courseId: string): Promise<CourseDetail | null> {
      try {
        const params = new URLSearchParams({
          applicationId: appId,
          accessKey,
          goraGolfCourseId: courseId,
          format: 'json',
        });

        const res = await fetch(
          `${GORA_BASE}/GoraGolfCourseDetail/${API_VERSION}?${params}`,
          {
            next: { revalidate: 86400 },
            headers: {
              'Referer': siteUrl,
              'Origin': siteUrl,
            },
          }
        );

        if (!res.ok) {
          console.error('Rakuten GORA detail failed:', res.status, await res.text());
          return null;
        }

        const data = await res.json();
        const item = data.Item ?? data;

        return {
          id: String(item.golfCourseId ?? courseId),
          name: String(item.golfCourseName ?? ''),
          prefecture: String(item.prefecture ?? ''),
          address: String(item.address ?? ''),
          layout_url: item.golfCourseImageUrl ? String(item.golfCourseImageUrl) : undefined,
          holes: [],
          raw_data: item as Record<string, unknown>,
        };
      } catch (error) {
        console.error('Rakuten GORA detail error:', error);
        return null;
      }
    },
  };
}
