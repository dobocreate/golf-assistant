# Golf Assistant - AIキャディー

ゴルフプレー中にAIが戦略的アドバイスを提供するWebアプリケーション。

**本番URL:** https://golf-assistant.vercel.app

## 主な機能

### プレー中
- **AIキャディー** — 状況（残り距離、ライ、傾斜、風）を入力するとGemini AIが推奨クラブ・戦略・注意点をリアルタイムアドバイス
- **スコア入力** — 打数・パットのステッパー入力、ホール切替で自動保存
- **ショット記録** — 各ショットの状況（クラブ、ライ、傾斜）と結果（方向、ミスタイプ）を記録
- **スコアカード** — 縦型テーブルで自分＋同伴者のスコアを一覧表示。Putt/FW/GIR折りたたみ対応
- **同伴者スコア** — カード画面で同伴者の打数・パットを入力
- **天候・風設定** — ラウンド単位の天候、ホール単位の風向き・風の強さを記録しAIアドバイスに反映
- **音声入力** — Web Speech APIによる音声でのメモ入力

### 振り返り
- **ラウンド詳細** — スコアテーブル、統計サマリー（FWキープ率、GIR率、平均パット等）
- **統計分析** — スコア推移、Par別平均、前半/後半比較、ファーストパット距離別分析
- **スコアコピー** — テキスト形式でスコアをクリップボードにコピー

### その他
- **コース検索** — 楽天GORA APIでゴルフ場を検索・保存。ホール詳細データのインポート
- **プロファイル** — ハンディキャップ、プレースタイル、ミス傾向、クラブ情報を登録
- **ナレッジベース** — スイング技術やコースマネジメントの知識を蓄積しAIアドバイスに活用

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| Frontend | Next.js 16 (App Router) + React 19 + Tailwind CSS 4 |
| Backend | Next.js Server Actions + API Routes |
| Database | Supabase (PostgreSQL + Auth + RLS) |
| AI | Google Gemini API (gemini-2.5-flash) via AI SDK |
| External | 楽天GORA API, Web Speech API |
| Hosting | Vercel |
| Package Manager | pnpm |

## セットアップ

### 前提条件

- Node.js v22+
- pnpm (`npm install -g pnpm`)

### インストール

```bash
git clone https://github.com/dobocreate/golf-assistant.git
cd golf-assistant
pnpm install
```

### 環境変数

`.env.local` を作成:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
RAKUTEN_APP_ID=
```

### 外部サービス

1. **[Supabase](https://supabase.com)** — PostgreSQL + Auth + RLS
2. **[Google AI Studio](https://aistudio.google.com)** — Gemini API Key
3. **[楽天ウェブサービス](https://webservice.rakuten.co.jp)** — アプリID

### 開発サーバー

```bash
pnpm dev
```

### デプロイ

- **自動:** GitHub上でPRをマージするとVercel Git連携で自動デプロイ
- **手動:** `npx vercel deploy --prod`

## スクリーンショット

| ダッシュボード | スコア入力 | スコアカード |
|:---:|:---:|:---:|
| ![Dashboard](docs/screenshot/01-dashboard.png) | ![Score](docs/screenshot/09-score-input.png) | ![Scorecard](docs/screenshot/07-play-home.png) |

## ライセンス

Private
