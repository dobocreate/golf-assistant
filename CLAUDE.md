# Golf Assistant - プロジェクト概要

## プロジェクト概要

AIキャディーアプリ。ゴルフプレー中にAIが戦略的アドバイスを提供するWebアプリケーション。

## アーキテクチャ

- **パターン:** Modular Monolith（Next.js フルスタック）
- **Frontend:** Next.js 15 (App Router) + React 19 + Tailwind CSS 4
- **Backend:** Next.js Server Actions + API Routes
- **Database:** Supabase (PostgreSQL + Auth + RLS)
- **Hosting:** Vercel Free Tier
- **LLM:** Google Gemini API (Flash-Lite) ※OpenAI互換形式で実装
- **External:** 楽天GORA API, Web Speech API (ブラウザ内蔵)
- **Package Manager:** pnpm

## 設計思想

**コンテキスト事前構築型:** プレー前にすべての情報（プレーヤー特性、コース情報、ナレッジ）をコンテキストとして構築。プレー中は状況入力＋事前構築コンテキストでGemini APIを呼び出すだけ。

**コスト方針:** 全サービスを無料枠で運用（月額¥0）。プレー前後の分析はClaudeサブスクリプション（手動対話）で実施。

## ドキュメント

| ドキュメント | パス |
|-------------|------|
| PRD (v1.4) | `docs/prd-golf-assistant-2026-03-20.md` |
| アーキテクチャ | `docs/architecture-golf-assistant-2026-03-20.md` |
| スプリント計画 | `docs/sprint-plan-golf-assistant-2026-03-20.md` |
| スプリントステータス | `.bmad/sprint-status.yaml` |

## 開発状況

**現在のフェーズ:** Sprint 0 開始前（STORY-001: プロジェクト初期セットアップ）

### MVP スプリント計画（4週間）

| Sprint | 内容 | Stories |
|--------|------|---------|
| Sprint 0 | 基盤構築（環境 + 認証 + レイアウト） | STORY-001〜003 |
| Sprint 1 | プロファイル + コース情報 | STORY-004〜006 |
| Sprint 2 | スコア記録 + 音声機能 | STORY-007〜011 |
| Sprint 3 | AIキャディー（コア機能） | STORY-012〜015 |
| Sprint 4 | 振り返り + 仕上げ → MVP完成 | STORY-016〜018 |

## セットアップ手順

### 前提条件

- Node.js v22+
- pnpm (`npm install -g pnpm`)
- Git

### 外部サービスアカウント（Sprint 0開始前に準備）

1. **Supabase** (https://supabase.com) — アカウント作成＋プロジェクト作成
2. **Google AI Studio** (https://aistudio.google.com) — Gemini API Key 取得
3. **楽天ウェブサービス** (https://webservice.rakuten.co.jp) — アプリID取得
4. **Vercel** (https://vercel.com) — アカウント作成＋GitHub連携

### 開発開始

```bash
git clone https://github.com/dobocreate/golf-assistant.git
cd golf-assistant
# Sprint 0 (STORY-001) で Next.js プロジェクトを作成する
```

### 環境変数（`.env.local` に設定）

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
RAKUTEN_APP_ID=
```

## コーディング規約

- TypeScript strict モード
- pnpm をパッケージマネージャーとして使用
- Server Actions を主要なデータ操作に使用
- Tailwind CSS でスタイリング
- モバイルファースト設計（プレー中画面は `/play` 配下）
