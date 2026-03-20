'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { mapAuthError } from '@/lib/auth-errors';

export async function updatePassword(formData: FormData) {
  const password = formData.get('password');

  if (typeof password !== 'string' || password.length < 8) {
    return { error: 'パスワードは8文字以上で入力してください。' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: mapAuthError(error.message) };
  }

  redirect('/');
}
