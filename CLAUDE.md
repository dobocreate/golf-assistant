# Golf Assistant - プロジェクト概要

## プロジェクト概要

AIキャディーアプリ。ゴルフプレー中にAIが戦略的アドバイスを提供するWebアプリケーション。

## アーキテクチャ

- **パターン:** Modular Monolith（Next.js フルスタック）
- **Frontend:** Next.js 16 (App Router) + React 19 + Tailwind CSS 4
- **Backend:** Next.js Server Actions + API Routes
- **Database:** Neon (PostgreSQL 17.8、Singapore、`weathered-queen-31344470`) + RLS (assistant_app / assistant_app_readonly / mapper_admin の 3 ロール)
- **Auth:** Clerk (Development tier、Email OTP only)
- **Storage:** Cloudflare R2 (`golf-assistant-prod/preview/dev`、default `pub-*.r2.dev` URL)
- **Hosting:** Vercel Free Tier
- **LLM:** Google Gemini API (gemini-2.5-flash) ※AI SDK経由
- **External:** 楽天GORA API, Web Speech API (ブラウザ内蔵)
- **Package Manager:** pnpm

> **移行履歴**: 元々 Supabase (DB + Auth + Storage) で運用していたが、Free tier 2 アクティブ枠の制約のため 2026-05-15〜2026-05-18 に Neon (DB) + Clerk (Auth) + R2 (Storage) へ全面移行 (PR #236〜#243)。Phase 8 で Supabase project 削除 + 旧 `cached_image_url*` 列撤去まで完了。

## 設計思想

**コンテキスト事前構築型:** プレー前にすべての情報（プレーヤー特性、コース情報、ナレッジ）をコンテキストとして構築。プレー中は状況入力＋事前構築コンテキストでGemini APIを呼び出すだけ。

**コスト方針:** 全サービスを無料枠で運用（月額¥0）。

## プレー中のデータ保存アーキテクチャ

- **ショット記録**: ラウンド開始時に `getShotsForRound()` で全ホール分を一括取得し、クライアントメモリに `Map<holeNumber, Shot[]>` として保持。ホール切替時はキャッシュから即座に読み込み（サーバーフェッチなし）。保存は「保存ボタン押下」「ホール切替時」「画面離脱時」の3契機で `saveShotsForHole()` を呼び出し。
- **スコア（打数・パット・風）**: ホール単位で `upsertScore()` により保存。保存ボタンまたはホール切替時に実行。
- **保存ボタン**: スコアとショット記録の両方の変更を検知し、一括保存する。

## 開発状況

**現在のフェーズ:** Supabase → Neon + Clerk + R2 移行完了 (Phase 1〜8 完了、PR #236〜#243 + cleanup PR)。アプリ側のコードは全て Neon + Clerk + R2 単独運用、Supabase project も削除済み。

### 完了済みスプリント

| Phase | Sprint | 内容 | Stories/Tasks |
|-------|--------|------|---------------|
| MVP | Sprint 0 | 基盤構築（環境 + 認証 + レイアウト） | STORY-001〜003 |
| MVP | Sprint 1 | プロファイル + コース情報 | STORY-004〜006 |
| MVP | Sprint 2 | スコア記録 + 音声機能 | STORY-007〜009, 011 |
| MVP | Sprint 3 | AIキャディー（コア機能） | STORY-012〜014, 010 |
| MVP | Sprint 4 | 振り返り + 仕上げ → MVP完成 | STORY-015〜018 |
| Post-MVP | Sprint 1 | ショット記録・統計・ナレッジ・インポート | STORY-019〜023 |
| Post-MVP | Sprint 2 | ホール詳細CSV・スコア再設計・編集・AIアドバイス改善・UX改善 | TASK-001〜004, UX-001 |
| Post-MVP | Sprint 3 | UI/UX改善・データ分析基盤・スコアカード画面 | PR #51〜#62 |
| Post-MVP | Sprint 4 | データ駆動型マネジメント支援（弱点アラート＋ゲームプラン） | PR #63〜#65 |
| Post-MVP | Sprint 5-7 | GPS マップ・ショット位置記録・自動軌跡 | PR #228〜#235 |
| Migration | Phase 1-8 | Supabase → Neon + Clerk + R2 移行 | PR #236〜#243 + cleanup |

### Migration Phase 1-8 の主な変更 (PR #236〜#243 + cleanup)
- **Phase 1 (PR #236)**: scaffolding (Neon `src/lib/db/neon.ts` / R2 / Clerk skelton + ESLint 制約)
- **Phase 2 (PR #237)**: DB 移行 (20 テーブル restore + 3 ロール + 62 RLS + 00040 RPC / 00041 clerk_user_id / 00042 roles)
- **Phase 3 (PR #238 + #240 + #241 + #242)**: Clerk 認証統合 (ClerkProvider + clerkMiddleware + `/clerk-sign-in` `/clerk-sign-up` + DB Server Actions 13 本 Neon helper 化)
- **Phase 4 (PR #237 commit d2b407a)**: Storage 移行 (Supabase Storage → R2、71 objects、URL builder `src/lib/r2.ts`)
- **Phase 5 (PR #239 + #240)**: API routes / pages / context-builders を Neon helper 化、`@/lib/auth-utils.ts` を requireUser 経由に統一
- **Phase 7 (PR #243)**: Supabase Auth 完全撤去 (auth pages 削除、`@supabase/supabase-js` / `@supabase/ssr` アンインストール、SignOutButton 採用)
- **Phase 8 (2026-05-18)**: Supabase project `tdbgcnoebbbbyrpsmoth` 削除 + `hole_view_configs.cached_image_url` / `cached_image_url_gsi` 列撤去 (migration 00045)、`HoleViewConfig.cached_image_url` を `aerial_image_url` に rename して R2 から都度ビルド
- **kishida 紐付け済**: Clerk User ID `user_3DozSZYql1ARkjVcMdWbCoRhG9y` ↔ 内部 UUID `f63edd8e-707f-437c-b0b8-8f728dedad57`

### Sprint 4 の主な変更 (PR #63〜#65)
- **ゲームプランデータ基盤**: game_plansテーブル新規作成（RLS+CHECK制約）、rounds.target_scoreカラム追加、Server Action 5関数（get/upsert/upsertBatch/delete/updateTargetScore）
- **ManagementBand**: スコア入力画面に弱点アラート＋ゲームプラン＋動的トーン表示（emerald/amber/rose 3段階）
- **ホール切替連動**: useMemoでホール番号に連動した自動表示切替、プラン未登録ホールは非表示
- **動的戦略調整**: 目標スコアとの差分でトーン自動切替（通常/攻めチャンス/守り重視）
- **折りたたみ機能**: ManagementBandをタップで色帯のみに縮小、再タップで展開
- **AIアドバイス連携**: ManagementBandからAdvicePanelへゲームプランコンテキスト（アラート＋プラン＋トーン）を引き継ぎ

### Sprint 3 の主な変更 (PR #51〜#62)
- **UI/UX Phase 1-4**: APIキー露出修正、error/not-found.tsx、保存状態常設表示、アクセシビリティ改善、metadata設定
- **ショットレコーダーリファクタリング**: 713行→4ファイル分割、UI並び替え（状況→AI→結果）
- **スコアカード画面**: BottomNavに「カード」タブ追加、縦型テーブル（Putt/FW/GIR折りたたみ）、同伴者スコア入力（保存ボタン方式）
- **ファーストパット距離**: ショットレコーダーのputtスロットで4択入力、scores.first_putt_distanceに同期
- **天候・風設定**: ラウンド単位の天候/風、ホール単位の風向き/風の強さ、AIアドバイスに送信
- **スタートコース切替**: プレー画面でOUT/IN変更可能
- **スコアサマリー改善**: 横並びステッパー、2カラム（スコア+トゥパー|パット）
- **保存安全性**: ScoreInputアンマウント時保存、同伴者バッチ保存Server Action

### 本番URL

https://golf-assistant.vercel.app

## ディレクトリ構成

```
src/
├── app/
│   ├── (main)/          # 認証済みメイン画面（サイドバー付きレイアウト）
│   │   ├── page.tsx            # ダッシュボード
│   │   ├── profile/            # プロファイル設定
│   │   ├── courses/            # コース検索・詳細
│   │   ├── knowledge/          # ナレッジベース CRUD
│   │   └── rounds/             # ラウンド履歴・詳細・統計
│   ├── play/            # プレー中画面（ダークモード・大きいUI）
│   │   ├── page.tsx            # ラウンド開始
│   │   ├── new/                # ラウンド開始フォーム
│   │   └── [roundId]/
│   │       ├── page.tsx        # プレー中メイン（設定: スタートコース、天候、風、同伴者）
│   │       ├── score/          # スコア入力（ステッパー、風設定、ショットレコーダー）
│   │       ├── scorecard/      # スコアカード（縦型テーブル、同伴者スコア入力）
│   │       ├── advice/         # AIアドバイス（リダイレクト）
│   │       └── complete/       # ラウンド完了
│   ├── api/
│   │   ├── advice/stream/      # AIアドバイス ストリーミングAPI
│   │   ├── advice/chat/        # AI チャット (Clerk requireUser 経由)
│   │   ├── courses/search/     # 楽天GORA コース検索API
│   │   ├── practice-suggestion/stream/  # 練習提案ストリーミング
│   │   ├── sync/               # オフライン同期 (score / shots RPC / companions RPC)
│   │   ├── webhooks/clerk/     # Clerk webhook (sign-up 通知)
│   │   ├── diag/db-write/      # cutover 検証用 (admin token)
│   │   └── freeze-probe/       # write freeze 検証用
│   ├── clerk-sign-in/[[...sign-in]]/     # Clerk ログインページ
│   └── clerk-sign-up/[[...sign-up]]/     # Clerk サインアップページ
├── features/            # ドメイン別機能モジュール
│   ├── advice/          # AIアドバイス（コンテキストビルダー、プロンプト、UI）
│   ├── course/          # コース管理（ホールインポート、ホール一覧）
│   ├── game-plan/       # ゲームプラン（型定義、弱点アラート＋攻略プラン）
│   ├── knowledge/       # ナレッジベース
│   ├── profile/         # プロファイル
│   ├── round/           # ラウンド管理（スタートコース切替、天候・風設定）
│   ├── score/           # スコア入力・ショット記録・スコアカード・同伴者スコア入力・ManagementBand
│   └── voice/           # 音声入力・読み上げ
├── actions/             # Server Actions (全て `requireUser + db.userRead/transaction` パターン)
├── components/ui/       # 共通UIコンポーネント（Button, Skeleton, NavProgress等）
└── lib/                 # ユーティリティ
    ├── db/neon.ts       # Neon pg helper (db.read / db.userRead / db.transaction / db.system + requireUser)
    ├── r2.ts            # R2 public URL builder
    ├── auth-utils.ts    # requireUser ラッパ (`getAuthenticatedUser`)
    └── geo.ts, geolocation/, llm/, etc.
```

## DBスキーマ（主要テーブル）

| テーブル | 概要 | マイグレーション |
|---------|------|----------------|
| profiles | ユーザープロファイル（HC、プレースタイル、ミス傾向、`clerk_user_id`） | 00001, 00002, 00041 |
| clubs | クラブ情報（飛距離、自信度） | 00001 |
| courses | コース情報（楽天GORAから取得） | 00001 |
| holes | ホール情報（12カラム: Par, 距離, HDCP, ドッグレッグ, 高低差, ティー別距離, ハザード, OB等） | 00001, 00004 |
| hole_notes | ホール別ユーザーメモ | 00001 |
| hole_view_configs | ホール画像 + 参照点 (R2 `object_key` / `object_key_gsi` から URL を都度ビルド) | 00031, 00032, 00043, 00044, 00045 |
| hole_areas, hole_map_points, hole_elevation_grids | GPS マップデータ | 00027, 00028, 00033 |
| rounds | ラウンド（ステータス, スタートコース, 天候, 風, 目標スコア, 使用グリーン） | 00001, 00010, 00014, 00016, 00034 |
| scores | ホール別スコア（打数, パット, FW, GIR, ティーショット方向, OB/バンカー/ペナルティ, ファーストパット距離, ファーストパット距離(数値m), 風向き/風の強さ） | 00001, 00005, 00013, 00015, 00018 |
| shots | ショット記録（クラブ, 結果, ミス, 方向, ライ, 傾斜, 風向き/風の強さ, GPS 緯度経度, auto_lie 等） | 00001, 00006, 00014, 00038 |
| companions | 同伴者 | 00012 |
| companion_scores | 同伴者スコア（打数, パット） | 00012 |
| game_plans, game_plan_sets, game_plan_holes | ゲームプラン（ホール別攻略テキスト, 弱点アラート, リスクレベル, 目標打数） | 00016 |
| memos | 音声/テキストメモ | 00001 |
| knowledge | ナレッジベース | 00001 |

### Neon ロール / RLS

- **assistant_app** (BYPASSRLS なし): アプリの read+write、14 user-scoped テーブルに RLS policy 4 種 × 14 = 56 + 共有 6 で計 62 policy
- **assistant_app_readonly**: pooled connection (`db.read` / `db.userRead`) で物理 read-only 強制
- **mapper_admin** (BYPASSRLS): mapper プロジェクト専用、hole_view_configs / hole_areas / hole_map_points / hole_elevation_grids / courses / holes のみ GRANT
- **current_user_id()** 関数: `app.current_user_id` setting (AsyncLocalStorage で SET LOCAL される) を返す。RLS policy が `user_id = current_user_id()::uuid` で参照
- **SECURITY INVOKER RPC**: `replace_shots_for_hole`, `replace_companion_scores_for_hole` (00040 で SECURITY DEFINER から書き換え、EXECUTE は assistant_app のみ)

## ドキュメント

| ドキュメント | パス |
|-------------|------|
| PRD (v1.4) | `docs/prd-golf-assistant-2026-03-20.md` |
| PRD v2.0 (Sprint 4) | `_bmad-output/planning-artifacts/prd.md` |
| UXデザイン仕様書 (Sprint 4) | `_bmad-output/planning-artifacts/ux-design-specification.md` |
| アーキテクチャ差分 (Sprint 4) | `_bmad-output/planning-artifacts/architecture-sprint4-diff.md` |
| エピック＆ストーリー (Sprint 4) | `_bmad-output/planning-artifacts/epics.md` |
| アーキテクチャ | `docs/architecture-golf-assistant-2026-03-20.md` |
| スプリント計画 | `docs/sprint-plan-golf-assistant-2026-03-20.md` |
| Post-MVP Sprint 2 設計 | `docs/design-post-mvp-sprint2.md` |
| BMAD Method | `_bmad/` (v6.2.2, bmm module) |

## セットアップ手順

### 前提条件

- Node.js v22+
- pnpm (`npm install -g pnpm`)
- Git

### 外部サービス

1. **Neon** (https://neon.tech) — PostgreSQL 17 + 3 ロール
2. **Clerk** (https://clerk.com) — Email OTP 認証
3. **Cloudflare R2** (https://cloudflare.com) — オブジェクトストレージ
4. **Google AI Studio** (https://aistudio.google.com) — Gemini API Key
5. **楽天ウェブサービス** (https://webservice.rakuten.co.jp) — アプリID
6. **Vercel** (https://vercel.com) — ホスティング

### 開発開始

```bash
git clone https://github.com/dobocreate/golf-assistant.git
cd golf-assistant
pnpm install
cp .env.local.example .env.local  # 環境変数を設定
pnpm dev
```

### 環境変数（`.env.local` に設定）

```bash
# Gemini
GEMINI_API_KEY=

# 楽天 GORA
NEXT_PUBLIC_RAKUTEN_APP_ID=
NEXT_PUBLIC_RAKUTEN_ACCESS_KEY=

# Neon
NEON_PROJECT_ID=
NEON_API_KEY=
NEON_DATABASE_URL_POOLED=  # role=assistant_app_readonly (read 用)
NEON_DATABASE_URL_DIRECT=  # role=assistant_app (write 用)

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/clerk-sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/clerk-sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_S3_ENDPOINT=  # https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
R2_BUCKET_NAME=  # golf-assistant-dev / preview / prod
R2_PUBLIC_BASE_URL=  # https://pub-*.r2.dev
```

### デプロイ

- **自動デプロイ:** GitHub上でPRをマージすると、Vercel Git連携により自動デプロイされる（通常ルート）
- **手動デプロイ:** mainに直接pushした場合は `npx vercel deploy --prod` で手動デプロイ

## コーディング規約

- TypeScript strict モード
- pnpm をパッケージマネージャーとして使用
- Server Actions を主要なデータ操作に使用
- Tailwind CSS でスタイリング
- モバイルファースト設計（プレー中画面は `/play` 配下、ダークモード）
- min-h-[48px] 以上のタッチターゲット
- 全画面にスケルトンスクリーン（loading.tsx）を配置

## ワークフロー

- **ブランチ戦略:** mainへの直接pushは禁止。必ず以下の流れで進める:
  1. フィーチャーブランチを作成
  2. 実装完了後、コードレビュー専門家（code-reviewer エージェント）にレビューを依頼
  3. 指摘事項を修正し、再レビューで承認（LGTM）を得る
  4. GitHub上のレビュー（Gemini Code Assist等）の指摘にも対応する
  5. 承認後にコミット・プッシュし、PRを作成
  6. squash merge でマージ
- **デプロイ:** PRマージ → Vercel自動デプロイ。mainへの直接push時のみ `npx vercel deploy --prod` で手動デプロイ
- **DB変更:** Neon MCP の `mcp__neon__run_sql` で適用 (projectId=`weathered-queen-31344470`)。ローカルの `supabase/migrations/` にも SQL ファイルを保持 (リポジトリ名は歴史的経緯、Neon でも同 SQL ファイルを使う)
- **認証 (kishida)**: Clerk User ID `user_3DozSZYql1ARkjVcMdWbCoRhG9y` (antian.jing@gmail.com)、内部 user_id `f63edd8e-707f-437c-b0b8-8f728dedad57`、`profiles.clerk_user_id` 紐付け済
