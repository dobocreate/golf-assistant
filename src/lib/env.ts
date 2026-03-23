function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getOptionalEnvVar(name: string): string | undefined {
  return process.env[name];
}

// ランタイムで遅延評価（ビルド時のページデータ収集でthrowしないようにする）
export const env = {
  get NEXT_PUBLIC_SUPABASE_URL() {
    return getEnvVar('NEXT_PUBLIC_SUPABASE_URL');
  },
  get NEXT_PUBLIC_SUPABASE_ANON_KEY() {
    return getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  },
  get RAKUTEN_APP_ID() {
    // TODO: NEXT_PUBLIC_ フォールバックはVercel環境変数の移行完了後に削除する
    return getOptionalEnvVar('RAKUTEN_APP_ID') || getOptionalEnvVar('NEXT_PUBLIC_RAKUTEN_APP_ID');
  },
  get RAKUTEN_ACCESS_KEY() {
    // TODO: NEXT_PUBLIC_ フォールバックはVercel環境変数の移行完了後に削除する
    return getOptionalEnvVar('RAKUTEN_ACCESS_KEY') || getOptionalEnvVar('NEXT_PUBLIC_RAKUTEN_ACCESS_KEY');
  },
} as const;
