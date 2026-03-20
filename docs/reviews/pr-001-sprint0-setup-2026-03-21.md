# PR #1 レビュー結果

- **PR:** [Sprint 0: レビュー反映 + STORY-001 プロジェクト初期セットアップ](https://github.com/dobocreate/golf-assistant/pull/1)
- **レビュー日:** 2026-03-21
- **ブランチ:** `feature/sprint-0` → `main`
- **変更規模:** 29ファイル (5,320追加 / 97削除)

---

## サマリー

Next.js 16 + Supabase + Tailwind CSS 4 の初期セットアップPR。全体的にアーキテクチャは健全で、Supabase SSRパターン・RLS・スキーマ設計は高品質。ただしRLSポリシーの安全性と環境変数バリデーションに要修正箇所あり。

**判定: 修正後マージ (Request Changes)**

| Severity | 件数 |
|----------|------|
| CRITICAL | 2 |
| HIGH     | 5 |
| MEDIUM   | 7 |
| LOW      | 4 |

---

## CRITICAL (マージ前に修正必須)

### C-1. 環境変数の `!` 非nullアサーション

**ファイル:** `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`

**問題:** 全Supabaseクライアントファクトリで `process.env.NEXT_PUBLIC_SUPABASE_URL!` のように非nullアサーションを使用。環境変数が未設定の場合、Supabase SDK内部で暗号的なランタイムエラーが発生し、原因特定が困難。

**修正案:** 共通バリデーションモジュールを作成し、起動時にfail-fastする:

```typescript
// src/lib/env.ts
function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  SUPABASE_URL: getEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
  SUPABASE_ANON_KEY: getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
} as const;
```

### C-2. courses/holes の UPDATE ポリシーが全認証ユーザーに開放

**ファイル:** `supabase/migrations/00001_initial_schema.sql`

**問題:**

```sql
create policy "Authenticated users can update courses" on courses
  for update using (auth.role() = 'authenticated');
```

任意の認証ユーザーが全コースレコードを更新可能。悪意あるユーザーが楽天GORA APIから取得した共有コースデータを改ざんできる。

**修正案:** UPDATE ポリシーを削除し、コース更新はServer Actions経由でサービスロールキーを使用して行う。または `created_by` カラムを追加し、作成者のみ更新可能にする。

---

## HIGH (強く修正推奨)

### H-1. `for all` ポリシーに明示的 `WITH CHECK` なし

**ファイル:** `supabase/migrations/00001_initial_schema.sql`

**問題:** `for all using (...)` は INSERT 時に `WITH CHECK` が省略されると `USING` 式が暗黙的にコピーされる。動作はするが、セキュリティモデルの監査が困難。

**修正案:** 操作ごとに明示的なポリシーに分割する:

```sql
create policy "Users can view own rounds" on rounds
  for select using (auth.uid() = user_id);
create policy "Users can insert own rounds" on rounds
  for insert with check (auth.uid() = user_id);
create policy "Users can update own rounds" on rounds
  for update using (auth.uid() = user_id);
create policy "Users can delete own rounds" on rounds
  for delete using (auth.uid() = user_id);
```

### H-2. `created_at`/`updated_at` に `NOT NULL` 制約なし

**ファイル:** `supabase/migrations/00001_initial_schema.sql`

**問題:** `created_at timestamptz default now()` に `NOT NULL` がないため、直接SQLで NULL を挿入可能。

**修正案:** 全テーブルで `created_at timestamptz not null default now()` に変更。

### H-3. `clubs` テーブルに `created_at`/`updated_at` カラムなし

**ファイル:** `supabase/migrations/00001_initial_schema.sql`

**問題:** 他の全テーブルにはタイムスタンプがあるが `clubs` のみ欠落。デバッグ・監査が困難。

**修正案:** `created_at timestamptz not null default now()` と `updated_at timestamptz not null default now()` を追加し、`updated_at` トリガーも設定。

### H-4. `auth.role()` の使用

**ファイル:** `supabase/migrations/00001_initial_schema.sql`

**問題:** courses/holes ポリシーで `auth.role() = 'authenticated'` を使用。Supabase推奨パターンは `auth.uid() is not null`。`auth.role()` はPostgreSQLロールを返すため、意味的に正確ではない。

**修正案:**

```sql
-- Before
for insert with check (auth.role() = 'authenticated');
-- After
for insert with check (auth.uid() is not null);
```

### H-5. サーバー側Supabaseクライアントの空catchブロック

**ファイル:** `src/lib/supabase/server.ts`

**問題:**

```typescript
} catch {
  // Server Component からの呼び出し時は無視
}
```

Server Componentでの `cookies().set()` 失敗は想定内だが、全エラーを黙殺するため予期しないエラーも隠蔽される。

**修正案:**

```typescript
} catch (error) {
  // Server Component からの呼び出し時はcookieの書き込みが不可（想定内）
  if (process.env.NODE_ENV === 'development') {
    console.warn('Cookie set failed:', error);
  }
}
```

---

## MEDIUM (改善推奨)

### M-1. RLSサブクエリのパフォーマンス

**ファイル:** `supabase/migrations/00001_initial_schema.sql`

`clubs`, `scores`, `shots`, `memos` のRLSポリシーで `IN (SELECT ...)` サブクエリを使用。データ増加時にパフォーマンスボトルネックになる可能性あり。`EXISTS` サブクエリの方がPostgreSQLオプティマイザに優しい。

```sql
-- Before
profile_id in (select id from profiles where user_id = auth.uid())
-- After
exists (select 1 from profiles where profiles.id = clubs.profile_id and profiles.user_id = auth.uid())
```

### M-2. 不足インデックス

`holes.course_id` と `hole_notes.user_id` にインデックスがない。RLSポリシーおよび一般的なクエリパターンで使用されるカラム。

```sql
create index idx_holes_course_id on holes(course_id);
create index idx_hole_notes_user_id on hole_notes(user_id);
```

### M-3. ミドルウェアのpublicパス管理

**ファイル:** `src/lib/supabase/middleware.ts`

現在 `/` のみがpublicパス。今後 `/about`, `/privacy` 等が追加される際に都度修正が必要。配列ベースのスケーラブルな管理を推奨。

```typescript
const publicPaths = ['/', '/auth', '/about', '/privacy'];
const isPublicPath = publicPaths.some(path =>
  request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(path + '/')
);
```

### M-4. `handicap` に範囲制約なし

`numeric(3,1)` は -9.9〜99.9 を許容するが、ゴルフハンディキャップは +9.9〜54.0（WHS準拠）。CHECK制約を追加推奨。

### M-5. `clubs.confidence` に範囲制約なし

`integer default 3` に範囲制約がない。1〜5スケールなら `check (confidence between 1 and 5)` を追加。

### M-6. `tsconfig.json` target が `ES2017`

Node 22+ なら `ES2022` が妥当。top-level await等の機能が利用可能に。

### M-7. 認証済みユーザーの `/auth/login` リダイレクトなし

認証済みユーザーが `/auth/login` にアクセスしても、ログインページが表示される。ダッシュボードへリダイレクトすべき。

---

## LOW (任意・フォローアップ可)

### L-1. デフォルトboilerplate SVG残存

`public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg` — `create-next-app` のデフォルトアセット。未使用のため削除推奨。

### L-2. `next-env.d.ts` がgit管理に含まれている

Next.js自動生成ファイル。`.gitignore` に追加を検討。

### L-3. `page.tsx` の `/auth/login` リンク先が未実装

STORY-002で対応予定のため現時点では許容。404が発生する点は認識しておくこと。

### L-4. `shots.club` と `clubs` テーブル間にFK関係なし

`shots.club` が `text` で `clubs.name` との参照整合性がない。意図的な非正規化（クラブ変更時の履歴保持）であればドキュメントに記載。

---

## 良い点

- **全テーブルでRLS有効化** — セキュリティファーストの設計
- **Supabase SSRパターン** — 公式推奨の client/server/middleware 3分割構成を正しく実装
- **スキーマ設計** — 適切なFK、UNIQUE制約、CHECK制約、カスケード削除
- **`knowledge.tags` にGINインデックス** — 配列カラム検索に正しいインデックス型を選択
- **TypeScript strict モード** — `tsconfig.json` で有効化済み
- **`updated_at` トリガー** — 必要なテーブルに正しく実装
- **Viewport export** — Next.js 16の推奨パターンに準拠（metadataと分離）
- **`.env.local` がgitignore済み** — `.env.local.example` でテンプレート提供
- **スプリント計画の見直し** — STORY-010, STORY-015の移動は妥当な判断
