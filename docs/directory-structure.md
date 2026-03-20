# ディレクトリ構造設計

MVP全5スプリント（22ストーリー）を見据えた最終的なディレクトリ構造。
各スプリントの実装時にファイル・ディレクトリを作成する（空ディレクトリは作成しない）。

凡例: `✅` 実装済み / `📋` 未実装（計画のみ）

## 設計方針

- **Modular Monolith:** 機能ドメインごとにディレクトリを分離（feature-based）
- **Next.js 16 App Router 規約:** `app/` はルーティングのみ、ロジックは `features/` や `lib/` に分離
- **Server Actions:** `actions/` に集約（ドメイン別ファイル、単一責務）
- **モバイルファースト:** プレー中画面は `/play` 配下に独立ルートグループとして配置
- **コロケーション:** UIコンポーネントは使用箇所に近い場所に配置
- **SOLID準拠:** 外部依存は抽象インターフェース経由、責務ごとにファイル分離

## ディレクトリ構造

```
golf-assistant/
├── .bmad/
│   └── sprint-status.yaml                          ✅
├── docs/
│   ├── prd-golf-assistant-2026-03-20.md             ✅
│   ├── architecture-golf-assistant-2026-03-20.md    ✅
│   ├── sprint-plan-golf-assistant-2026-03-20.md     ✅
│   ├── review-sprint-plan-2026-03-21.md             ✅
│   ├── directory-structure.md                       ✅ (本ファイル)
│   └── reviews/
│       └── pr-001-sprint0-setup-2026-03-21.md       ✅
├── public/
│   └── (アプリアイコン、OGP画像等)                    📋
├── supabase/
│   └── migrations/
│       ├── 00001_initial_schema.sql                 ✅
│       └── (以降のマイグレーション)                    📋
│
├── src/
│   ├── app/                              # ルーティング層（薄く保つ）
│   │   ├── layout.tsx                    ✅ ルートレイアウト（フォント、メタデータ）
│   │   ├── globals.css                   ✅ Tailwind CSS グローバルスタイル
│   │   ├── favicon.ico                   ✅
│   │   │
│   │   ├── auth/                         # 認証ページ群 [Sprint 0] ✅
│   │   │   ├── login/page.tsx            ✅
│   │   │   ├── signup/page.tsx           ✅
│   │   │   ├── reset-password/page.tsx   ✅
│   │   │   ├── update-password/page.tsx  ✅ パスワード更新（リセット後）
│   │   │   └── callback/route.ts         ✅ OAuth/マジックリンク用コールバック
│   │   │
│   │   ├── (main)/                       # 認証必須ルートグループ（メインレイアウト）
│   │   │   ├── layout.tsx                ✅ 共通レイアウト（サイドバー + ボトムナビ）
│   │   │   ├── page.tsx                  ✅ ホーム（ダッシュボード相当）
│   │   │   │
│   │   │   ├── profile/                  # プロファイル管理 [Sprint 1]
│   │   │   │   ├── page.tsx              ✅ プレースホルダー
│   │   │   │   └── clubs/
│   │   │   │       └── page.tsx          📋 クラブ設定
│   │   │   │
│   │   │   ├── courses/                  # コース情報 [Sprint 1]
│   │   │   │   ├── page.tsx              ✅ プレースホルダー
│   │   │   │   └── [courseId]/
│   │   │   │       ├── page.tsx          📋 コース詳細・ホール一覧
│   │   │   │       └── holes/
│   │   │   │           └── [holeNumber]/
│   │   │   │               └── page.tsx  📋 ホール詳細・ノート編集
│   │   │   │
│   │   │   └── rounds/                   # ラウンド履歴 [Sprint 4]
│   │   │       ├── page.tsx              ✅ プレースホルダー
│   │   │       └── [roundId]/
│   │   │           └── page.tsx          📋 ラウンド振り返り
│   │   │
│   │   ├── play/                         # プレー中画面（独立ルートグループ、モバイル最適化）
│   │   │   ├── layout.tsx                ✅ プレー中専用レイアウト（ミニマル + プレー用ボトムナビ）
│   │   │   ├── page.tsx                  ✅ プレースホルダー
│   │   │   ├── new/
│   │   │   │   └── page.tsx              📋 ラウンド開始・コース選択 [Sprint 2]
│   │   │   └── [roundId]/
│   │   │       ├── page.tsx              📋 プレー中メイン画面（ホール選択）
│   │   │       ├── score/
│   │   │       │   └── page.tsx          📋 スコア入力 [Sprint 2]
│   │   │       ├── advice/
│   │   │       │   └── page.tsx          📋 AIアドバイス表示 [Sprint 3]
│   │   │       └── complete/
│   │   │           └── page.tsx          📋 ラウンド完了 [Sprint 2]
│   │   │
│   │   ├── knowledge/                    📋 ナレッジベース [Post-MVP]
│   │   │   └── page.tsx
│   │   │
│   │   └── api/                          # API Routes（外部API プロキシ）
│   │       ├── courses/
│   │       │   └── search/
│   │       │       └── route.ts          📋 コース検索プロキシ [Sprint 1]
│   │       └── advice/
│   │           └── stream/
│   │               └── route.ts          📋 LLM ストリーミング [Sprint 3]
│   │
│   ├── actions/                          # Server Actions（単一責務で分割）
│   │   ├── auth.ts                       ✅ ログイン、サインアップ、ログアウト
│   │   ├── update-password.ts            ✅ パスワード更新
│   │   ├── profile.ts                    📋 プロファイルCRUD [Sprint 1]
│   │   ├── club.ts                       📋 クラブCRUD [Sprint 1]
│   │   ├── course.ts                     📋 コース・ホールノート操作 [Sprint 1]
│   │   ├── round.ts                      📋 ラウンドライフサイクル（開始・完了）[Sprint 2]
│   │   ├── score.ts                      📋 スコア・ショット記録 [Sprint 2]
│   │   ├── memo.ts                       📋 音声/テキストメモ保存 [Sprint 2]
│   │   └── advice.ts                     📋 コンテキスト構築・アドバイス生成 [Sprint 3]
│   │
│   ├── components/                       # 共通UIコンポーネント
│   │   ├── ui/                           📋 汎用UI部品
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── card.tsx
│   │   │   ├── modal.tsx
│   │   │   ├── loading.tsx
│   │   │   └── error-message.tsx
│   │   └── layout/                       # レイアウト部品
│   │       ├── nav-items.ts              ✅ ナビゲーション項目定義
│   │       ├── sidebar-nav.tsx           ✅ PCサイドバーナビ
│   │       ├── mobile-bottom-nav.tsx     ✅ モバイルボトムナビ（メイン画面用）
│   │       └── play-bottom-nav.tsx       ✅ プレー中ボトムナビ
│   │
│   ├── features/                         📋 機能ドメイン別モジュール
│   │   ├── profile/                      📋 プロファイル管理 [Sprint 1]
│   │   │   ├── components/
│   │   │   │   ├── profile-form.tsx
│   │   │   │   └── club-list.tsx
│   │   │   └── types.ts
│   │   │
│   │   ├── course/                       📋 コース情報 [Sprint 1]
│   │   │   ├── components/
│   │   │   │   ├── course-search.tsx
│   │   │   │   ├── course-card.tsx
│   │   │   │   ├── hole-list.tsx
│   │   │   │   └── hole-note-editor.tsx
│   │   │   └── types.ts
│   │   │
│   │   ├── round/                        📋 ラウンド管理 [Sprint 2]
│   │   │   ├── components/
│   │   │   │   ├── round-start-form.tsx
│   │   │   │   └── round-summary.tsx
│   │   │   └── types.ts
│   │   │
│   │   ├── score/                        📋 スコア記録 [Sprint 2]
│   │   │   ├── components/
│   │   │   │   ├── score-input.tsx
│   │   │   │   └── hole-score-card.tsx
│   │   │   └── types.ts
│   │   │
│   │   ├── advice/                       📋 AIアドバイス [Sprint 3]
│   │   │   ├── components/
│   │   │   │   ├── situation-input.tsx
│   │   │   │   ├── advice-display.tsx
│   │   │   │   └── context-preview.tsx
│   │   │   ├── lib/
│   │   │   │   ├── context-builder.ts    # コンテキスト事前構築ロジック
│   │   │   │   └── prompt-template.ts    # プロンプトテンプレート
│   │   │   └── types.ts
│   │   │
│   │   ├── voice/                        📋 音声I/O [Sprint 2-3]
│   │   │   ├── hooks/
│   │   │   │   ├── use-speech-recognition.ts
│   │   │   │   └── use-speech-synthesis.ts
│   │   │   └── components/
│   │   │       ├── voice-input-button.tsx
│   │   │       └── voice-reader.tsx
│   │   │
│   │   └── review/                       📋 ラウンド振り返り [Sprint 4]
│   │       ├── components/
│   │       │   ├── score-chart.tsx
│   │       │   ├── round-detail.tsx
│   │       │   └── round-history.tsx
│   │       └── types.ts
│   │
│   ├── hooks/                            📋 共通カスタムフック
│   │   ├── use-auth.ts                   # 認証状態管理
│   │   └── use-media-query.ts            # レスポンシブ判定
│   │
│   ├── lib/                              # ユーティリティ・インフラ層
│   │   ├── supabase/
│   │   │   ├── client.ts                 ✅ ブラウザ用Supabaseクライアント
│   │   │   ├── server.ts                 ✅ サーバー用Supabaseクライアント
│   │   │   └── middleware.ts             ✅ セッション更新ロジック
│   │   ├── auth-errors.ts                ✅ 認証エラーメッセージ定義
│   │   ├── llm/                          📋 LLM抽象化（DIP: 抽象に依存）
│   │   │   ├── types.ts                  # LLMClient インターフェース定義
│   │   │   └── gemini.ts                 # Gemini 具象実装 [Sprint 3]
│   │   ├── course-source/                📋 コース情報ソース抽象化（DIP: 抽象に依存）
│   │   │   ├── types.ts                  # CourseSource インターフェース定義
│   │   │   └── rakuten-gora.ts           # 楽天GORA 具象実装 [Sprint 1]
│   │   ├── env.ts                        📋 環境変数バリデーション
│   │   └── utils.ts                      📋 汎用ユーティリティ（cn関数等）
│   │
│   ├── types/                            📋 グローバル型定義
│   │   ├── database.ts                   # Supabase DB型（自動生成 or 手動）
│   │   └── index.ts                      # 共通型エクスポート
│   │
│   └── middleware.ts                     ✅ Next.js ミドルウェア（ルーティング）
│
├── .env.local.example                    ✅
├── .gitignore                            ✅
├── .prettierrc                           ✅
├── eslint.config.mjs                     ✅
├── next-env.d.ts                         ✅ (自動生成)
├── next.config.ts                        ✅
├── package.json                          ✅
├── pnpm-lock.yaml                        ✅
├── postcss.config.mjs                    ✅
├── tsconfig.json                         ✅
└── CLAUDE.md                             ✅
```

## 設計上の実装時の判断（計画との差分）

| 計画 | 実装 | 理由 |
|------|------|------|
| `(protected)/` ルートグループ | `(main)/` ルートグループ | メインレイアウト適用を意味する名前に変更。認証保護はミドルウェアで担当 |
| `play/` を `(main)/` 内にネスト | `play/` を `app/` 直下に独立配置 | プレー中画面は `(main)` レイアウト（サイドバー等）を適用せず、専用のミニマルレイアウトを使用するため |
| `page.tsx` をランディングページに | `(main)/page.tsx` をホーム画面に | ルートレイアウトの直下にはページを置かず、`(main)` 内にホーム画面を配置 |
| `components/layout/header.tsx` | `components/layout/sidebar-nav.tsx` | PCレイアウトをヘッダー型からサイドバー型に変更 |
| `components/layout/mobile-nav.tsx` | `mobile-bottom-nav.tsx` + `play-bottom-nav.tsx` | メイン画面用とプレー中用でボトムナビを分離（SRP） |
| — | `components/layout/nav-items.ts` | ナビゲーション項目の定義を共有モジュールとして抽出 |
| — | `actions/update-password.ts` | パスワードリセットフローの完了ステップとして追加（SRP: auth.tsと分離） |
| — | `auth/update-password/page.tsx` | パスワード更新UIページを追加 |
| — | `lib/auth-errors.ts` | 認証エラーメッセージの日本語マッピングを専用モジュールに分離 |
| `knowledge/` を `(main)/` 内に | `knowledge/` を `app/` 直下に | ナレッジベースのレイアウト要件が未確定のため、配置は実装時に決定 |

## SOLID原則の適用

### S: Single Responsibility（単一責務）

各ディレクトリ・ファイルが1つの変更理由のみを持つように分割。

| 分割前 | 分割後 | 理由 |
|--------|--------|------|
| `actions/round.ts`（ラウンド＋スコア） | `actions/round.ts` + `actions/score.ts` | ラウンドフローの変更とスコア入力UIの変更は独立した理由 |
| `actions/profile.ts`（プロファイル＋クラブ） | `actions/profile.ts` + `actions/club.ts` | プロファイル編集とクラブ管理は異なるユースケース |
| `features/round/`（ラウンド＋スコア） | `features/round/` + `features/score/` | UIコンポーネントも責務に合わせて分離 |
| `mobile-nav.tsx`（全画面共通） | `mobile-bottom-nav.tsx` + `play-bottom-nav.tsx` | メイン画面とプレー中画面でナビ要件が異なる |
| `actions/auth.ts`（全認証） | `actions/auth.ts` + `actions/update-password.ts` | パスワード更新は独立したフロー |

### O: Open/Closed（開放閉鎖）

外部APIクライアントをインターフェース＋具象実装に分離し、既存コードを修正せずにプロバイダーを差し替え可能にする。

```
lib/llm/
├── types.ts          # LLMClient インターフェース（閉じている）
└── gemini.ts         # 具象実装（拡張ポイント）
                      # → OpenAI に切り替える場合は openai.ts を追加するだけ

lib/course-source/
├── types.ts          # CourseSource インターフェース（閉じている）
└── rakuten-gora.ts   # 具象実装（拡張ポイント）
                      # → 別のコース情報ソースを追加する場合も同様
```

### L: Liskov Substitution（リスコフの置換）

`LLMClient` インターフェースを満たす任意の実装（Gemini, OpenAI等）が、呼び出し側のコードを変更せずに差し替え可能。`CourseSource` も同様。

### I: Interface Segregation（インターフェース分離）

- `types/database.ts`: Supabase自動生成の全テーブル型（インフラ層）
- `features/*/types.ts`: 各ドメインが必要な型だけを定義・re-export
- 各featureは自身の `types.ts` のみに依存し、不要なテーブル型をインポートしない

### D: Dependency Inversion（依存性逆転）

高レベルモジュール（features, actions）は抽象インターフェースに依存し、具象実装には依存しない。

```
依存の方向:
  features/advice/ → lib/llm/types.ts (抽象)  ← lib/llm/gemini.ts (具象)
  actions/course.ts → lib/course-source/types.ts (抽象)  ← lib/course-source/rakuten-gora.ts (具象)
```

**例外:** Supabase は全体のインフラ層（DB + Auth）であり、抽象化のコストが利点を上回るため、具象依存を許容する。

## 設計判断の理由

### 1. `(main)/` ルートグループ

Next.js App Router の Route Groups を使用。メインレイアウト（サイドバー + ボトムナビ）を適用するページを `(main)` でグループ化。URLには `(main)` は含まれない。認証保護はミドルウェアで一元管理。

### 2. `play/` を独立ルートグループとして配置

プレー中画面は `(main)` のレイアウト（サイドバー等）を使わず、専用のミニマルレイアウト（大きなタッチターゲット、プレー用ボトムナビ）を適用する。`app/play/layout.tsx` で独自レイアウトを定義。

### 3. `features/` vs `components/`

- `components/`: ドメインに依存しない汎用UI部品（Button, Input等）とレイアウト部品
- `features/`: 特定ドメインに属するコンポーネント・ロジック・型定義をコロケーション

### 4. `actions/` をトップレベルに配置

Server Actions は複数のページから呼ばれるため、`app/` 内のページに紐づけるよりトップレベルに集約する方が管理しやすい。ドメイン別にファイル分割（単一責務）。

### 5. `lib/llm/` と `lib/course-source/` の抽象化

外部APIクライアントをインターフェース＋具象実装に分離（OCP + DIP）。将来のプロバイダー変更（Gemini→OpenAI、楽天GORA→別ソース）に既存コードの修正なしで対応可能。

### 6. API Routes は最小限

Server Actions を主要なデータ操作に使用。API Routes は外部APIプロキシ（コース検索、LLMストリーミング）のみ。

## スプリント別の作成タイミング

| Sprint | 作成するディレクトリ・ファイル |
|--------|------------------------------|
| Sprint 0 | ✅ `auth/`, `(main)/layout.tsx`, `components/layout/`, `actions/auth.ts`, `actions/update-password.ts`, `lib/auth-errors.ts`, `play/layout.tsx` |
| Sprint 0 残 | 📋 `components/ui/`, `lib/env.ts`, `hooks/` |
| Sprint 1 | 📋 `profile/clubs/`, `courses/[courseId]/`, `features/profile/`, `features/course/`, `actions/profile.ts`, `actions/club.ts`, `actions/course.ts`, `lib/course-source/`, `api/courses/`, `types/` |
| Sprint 2 | 📋 `play/new/`, `play/[roundId]/`, `features/round/`, `features/score/`, `features/voice/`, `actions/round.ts`, `actions/score.ts`, `actions/memo.ts` |
| Sprint 3 | 📋 `play/[roundId]/advice/`, `features/advice/`, `actions/advice.ts`, `lib/llm/`, `api/advice/` |
| Sprint 4 | 📋 `rounds/[roundId]/`, `features/review/` |
| Post-MVP | 📋 `knowledge/` |
