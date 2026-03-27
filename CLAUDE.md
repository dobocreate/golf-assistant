# Golf Assistant - プロジェクト概要

## プロジェクト概要

AIキャディーアプリ。ゴルフプレー中にAIが戦略的アドバイスを提供するWebアプリケーション。

## アーキテクチャ

- **パターン:** Modular Monolith（Next.js フルスタック）
- **Frontend:** Next.js 16 (App Router) + React 19 + Tailwind CSS 4
- **Backend:** Next.js Server Actions + API Routes
- **Database:** Supabase (PostgreSQL + Auth + RLS)
- **Hosting:** Vercel Free Tier
- **LLM:** Google Gemini API (gemini-2.5-flash) ※AI SDK経由
- **External:** 楽天GORA API, Web Speech API (ブラウザ内蔵)
- **Package Manager:** pnpm

## 設計思想

**コンテキスト事前構築型:** プレー前にすべての情報（プレーヤー特性、コース情報、ナレッジ）をコンテキストとして構築。プレー中は状況入力＋事前構築コンテキストでGemini APIを呼び出すだけ。

**コスト方針:** 全サービスを無料枠で運用（月額¥0）。

## 開発状況

**現在のフェーズ:** Post-MVP Sprint 4 完了。データ駆動型マネジメント支援（弱点アラート＋スマートゲームプラン）を実装。

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

### Sprint 4 の主な変更 (PR #63〜#65)
- **ゲームプランデータ基盤**: game_plansテーブル新規作成（RLS+CHECK制約）、rounds.target_scoreカラム追加、Server Action 5関数（get/upsert/upsertBatch/delete/updateTargetScore）
- **ManagementBand**: スコア入力画面に弱点アラート＋ゲームプラン＋動的トーン表示（emerald/amber/rose 3段階）
- **ホール切替連動**: useMemoでホール番号に連動した自動表示切替、プラン未登録ホールは非表示
- **動的戦略調整**: 目標スコアとの差分でトーン自動切替（通常/攻めチャンス/守り重視）
- **折りたたみ機能**: ManagementBandをタップで色帯のみに縮小、再タップで展開
- **AIアドバイス連携**: ManagementBandからAdvicePanelへゲームプランコンテキスト（アラート＋プラン＋トーン）を引き継ぎ

### Sprint 3 の主な変更 (PR #51〜#62)
- **UI/UX Phase 1-4**: APIキー露出修正、error/not-found.tsx、保存状態常設表示、アクセシビリティ改善、metadata設定
- **ショットレコーダーリファクタリング**: 713行→4ファイル分割、UI並び替え（状況→AI→結果）、一時保存方式（ホール切替時バッチ保存）
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
│   │   └── courses/search/     # 楽天GORA コース検索API
│   └── auth/            # 認証（ログイン・サインアップ・パスワードリセット）
├── features/            # ドメイン別機能モジュール
│   ├── advice/          # AIアドバイス（コンテキストビルダー、プロンプト、UI）
│   ├── course/          # コース管理（ホールインポート、ホール一覧）
│   ├── game-plan/       # ゲームプラン（型定義、弱点アラート＋攻略プラン）
│   ├── knowledge/       # ナレッジベース
│   ├── profile/         # プロファイル
│   ├── round/           # ラウンド管理（スタートコース切替、天候・風設定）
│   ├── score/           # スコア入力・ショット記録・スコアカード・同伴者スコア入力・ManagementBand
│   └── voice/           # 音声入力・読み上げ
├── actions/             # Server Actions
├── components/ui/       # 共通UIコンポーネント（Button, Skeleton, NavProgress等）
└── lib/                 # ユーティリティ（Supabaseクライアント、認証、LLM）
```

## DBスキーマ（主要テーブル）

| テーブル | 概要 | マイグレーション |
|---------|------|----------------|
| profiles | ユーザープロファイル（HC、プレースタイル、ミス傾向） | 00001, 00002 |
| clubs | クラブ情報（飛距離、自信度） | 00001 |
| courses | コース情報（楽天GORAから取得） | 00001 |
| holes | ホール情報（12カラム: Par, 距離, HDCP, ドッグレッグ, 高低差, ティー別距離, ハザード, OB等） | 00001, 00004 |
| hole_notes | ホール別ユーザーメモ | 00001 |
| rounds | ラウンド（ステータス, スタートコース, 天候, 風, 目標スコア） | 00001, 00010, 00014, 00016 |
| scores | ホール別スコア（打数, パット, FW, GIR, ティーショット方向, OB/バンカー/ペナルティ, ファーストパット距離, 風向き/風の強さ） | 00001, 00005, 00013, 00015 |
| shots | ショット記録（クラブ, 結果, ミス, 方向, ライ, 傾斜, 風向き/風の強さ） | 00001, 00006, 00014 |
| companions | 同伴者 | 00012 |
| companion_scores | 同伴者スコア（打数, パット） | 00012 |
| game_plans | ゲームプラン（ホール別攻略テキスト, 弱点アラート, リスクレベル, 目標打数） | 00016 |
| memos | 音声/テキストメモ | 00001 |
| knowledge | ナレッジベース | 00001 |

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

1. **Supabase** (https://supabase.com) — PostgreSQL + Auth + RLS
2. **Google AI Studio** (https://aistudio.google.com) — Gemini API Key
3. **楽天ウェブサービス** (https://webservice.rakuten.co.jp) — アプリID
4. **Vercel** (https://vercel.com) — ホスティング

### 開発開始

```bash
git clone https://github.com/dobocreate/golf-assistant.git
cd golf-assistant
pnpm install
cp .env.example .env.local  # 環境変数を設定
pnpm dev
```

### 環境変数（`.env.local` に設定）

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
RAKUTEN_APP_ID=
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
- **DB変更:** Supabase MCP の `apply_migration` で適用。ローカルの `supabase/migrations/` にもファイルを保持
