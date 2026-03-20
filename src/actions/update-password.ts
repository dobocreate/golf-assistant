'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function updatePassword(formData: FormData) {
  const password = formData.get('password');

  if (typeof password !== 'string' || password.length < 8) {
    return { error: 'パスワードは8文字以上で入力してください。' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: 'パスワードの更新に失敗しました。もう一度お試しください。' };
  }

  redirect('/');
}
