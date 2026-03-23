import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

const GORA_BASE = 'https://openapi.rakuten.co.jp/engine/api/Gora';

export async function GET(request: Request) {
  // 認証チェック
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query?.trim()) {
    return NextResponse.json({ error: '検索キーワードを入力してください。' }, { status: 400 });
  }

  const appId = env.RAKUTEN_APP_ID;
  const accessKey = env.RAKUTEN_ACCESS_KEY;
  if (!appId || !accessKey) {
    console.error('Rakuten API keys not configured:', { appId: !!appId, accessKey: !!accessKey });
    return NextResponse.json(
      { error: '楽天GORA APIが設定されていません。' },
      { status: 503 }
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://golf-assistant.vercel.app';

  const params = new URLSearchParams({
    applicationId: appId,
    accessKey,
    keyword: query.trim(),
    format: 'json',
    hits: '20',
  });

  const apiUrl = `${GORA_BASE}/GoraGolfCourseSearch/20170623?${params}`;

  const res = await fetch(apiUrl, {
    headers: {
      'Referer': siteUrl,
      'Origin': siteUrl,
    },
  });

  const rawText = await res.text();

  if (!res.ok) {
    console.error('Rakuten API error:', { status: res.status, body: rawText.substring(0, 500) });
    return NextResponse.json({ error: 'コース検索に失敗しました。' }, { status: 502 });
  }

  try {
    const data = JSON.parse(rawText);
    const items = data.Items ?? [];
    const results = items.map((item: Record<string, unknown>) => {
      const golf = (item.Item ?? item) as Record<string, unknown>;
      return {
        id: String(golf.golfCourseId ?? ''),
        name: String(golf.golfCourseName ?? ''),
        prefecture: String(golf.prefecture ?? ''),
        address: String(golf.address ?? ''),
        image_url: golf.golfCourseImageUrl ? String(golf.golfCourseImageUrl) : undefined,
      };
    });
    return NextResponse.json({ results, count: data.count });
  } catch (e) {
    console.error('Rakuten API parse error:', e, rawText.substring(0, 500));
    return NextResponse.json({ error: 'コース検索結果の処理に失敗しました。' }, { status: 500 });
  }
}
