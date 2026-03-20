import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const type = searchParams.get('type');
  const errorDescription = searchParams.get('error_description');

  if (!code) {
    const loginUrl = new URL('/auth/login', origin);
    if (errorDescription) {
      loginUrl.searchParams.set('error', '認証に失敗しました。時間をおいて再度お試しください。');
    }
    return NextResponse.redirect(loginUrl.toString());
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const loginUrl = new URL('/auth/login', origin);
    loginUrl.searchParams.set('error', '認証処理に失敗しました。もう一度お試しください。');
    return NextResponse.redirect(loginUrl.toString());
  }

  // パスワードリセットの場合はパスワード更新ページに遷移
  if (type === 'recovery') {
    return NextResponse.redirect(new URL('/auth/update-password', origin).toString());
  }

  return NextResponse.redirect(origin);
}
