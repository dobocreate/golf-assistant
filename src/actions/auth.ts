'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { mapAuthError } from '@/lib/auth-errors';

function getRedirectBase(): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    if (process.env.VERCEL_URL) {
      return `https://${process.env.VERCEL_URL}`;
    }
    return 'http://localhost:3000';
  }
  return siteUrl;
}

function validateCredentials(formData: FormData): { email: string; password: string } | { error: string } {
  const email = formData.get('email');
  const password = formData.get('password');

  if (typeof email !== 'string' || !email.trim()) {
    return { error: 'メールアドレスは必須です。' };
  }
  if (typeof password !== 'string' || password.length < 8) {
    return { error: 'パスワードは8文字以上で入力してください。' };
  }
  return { email: email.trim(), password };
}

export async function login(formData: FormData) {
  const result = validateCredentials(formData);
  if ('error' in result) {
    return result;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: result.email,
    password: result.password,
  });

  if (error) {
    return { error: mapAuthError(error.message) };
  }

  redirect('/');
}

export async function signup(formData: FormData): Promise<{ error: string } | { success: string }> {
  const result = validateCredentials(formData);
  if ('error' in result) {
    return result;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: result.email,
    password: result.password,
    options: {
      emailRedirectTo: `${getRedirectBase()}/auth/callback`,
    },
  });

  if (error) {
    return { error: mapAuthError(error.message) };
  }

  // メール確認が無効の場合、セッションが即発行される
  if (data.session) {
    redirect('/');
  }

  return { success: '確認メールを送信しました。メールのリンクをクリックしてください。' };
}

export async function logout() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('Logout failed:', error.message);
  }

  redirect('/auth/login');
}

export async function resetPassword(formData: FormData) {
  const email = formData.get('email');

  if (typeof email !== 'string' || !email.trim()) {
    return { error: 'メールアドレスは必須です。' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${getRedirectBase()}/auth/callback?type=recovery`,
  });

  if (error) {
    return { error: mapAuthError(error.message) };
  }

  return { success: 'パスワードリセットメールを送信しました。' };
}
