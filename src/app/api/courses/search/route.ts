import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createRakutenGoraSource } from '@/lib/course-source/rakuten-gora';

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

  const appId = process.env.RAKUTEN_APP_ID;
  if (!appId) {
    return NextResponse.json(
      { error: '楽天GORA APIが設定されていません。' },
      { status: 503 }
    );
  }

  try {
    const gora = createRakutenGoraSource(appId);
    const results = await gora.search(query.trim());
    return NextResponse.json({ results });
  } catch (error) {
    console.error('Course search failed:', error);
    return NextResponse.json({ error: 'コース検索に失敗しました。' }, { status: 500 });
  }
}
