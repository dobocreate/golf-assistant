// Supabase DB型定義
// TODO: `npx supabase gen types typescript` で自動生成に置き換え
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
