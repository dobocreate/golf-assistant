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

export const env = {
  NEXT_PUBLIC_SUPABASE_URL: getEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  RAKUTEN_APP_ID: getOptionalEnvVar('NEXT_PUBLIC_RAKUTEN_APP_ID'),
  RAKUTEN_ACCESS_KEY: getOptionalEnvVar('NEXT_PUBLIC_RAKUTEN_ACCESS_KEY'),
} as const;
