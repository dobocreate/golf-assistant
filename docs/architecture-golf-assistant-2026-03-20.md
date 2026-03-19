# System Architecture: Golf Assistant

**Date:** 2026-03-20
**Architect:** kishida
**Version:** 1.0
**Project Type:** Web Application (Responsive)
**Project Level:** Level 3
**Status:** Draft

---

## Document Overview

This document defines the system architecture for Golf Assistant. It provides the technical blueprint for implementation, addressing all functional and non-functional requirements from the PRD.

**Related Documents:**
- Product Requirements Document: `docs/prd-golf-assistant-2026-03-20.md`

---

## Executive Summary

Golf Assistant は、Next.js フルスタック＋Supabase＋Gemini API による**完全無料運用可能**なWebアプリケーションとして構築する。

コンテキスト事前構築型の設計思想に基づき、プレー前に蓄積したデータ（プレーヤー特性、コース情報、ナレッジ）をシステムプロンプトとして組み立て、プレー中は状況入力のみでGemini APIからアドバイスを受け取る。

すべての機能をクラウド上の単一アプリケーションとして提供し、PCブラウザとスマートフォンブラウザの両方から同一URLでアクセスする。ローカル/オンラインのデータ同期は不要。

---

## Architectural Drivers

以下の要件がアーキテクチャ設計を支配する：

| 優先度 | ドライバー | 要件 | アーキテクチャへの影響 |
|--------|-----------|------|----------------------|
| 1 | **NFR-008: コスト最小化** | 月額¥0運用 | 全サービスを無料枠で運用。Vercel + Supabase + Gemini API Free |
| 2 | **NFR-001: レスポンス** | AI 5秒以内、UI 200ms以内 | Gemini Flash-Lite直接呼び出し、Edge Functions活用 |
| 3 | **NFR-002: 操作性** | 2タップ以内、片手操作 | モバイルファーストUI設計、大きなタッチターゲット |
| 4 | **NFR-005: データ永続性** | 入力データ即時保存 | Supabaseリアルタイム保存、楽観的UI更新 |
| 5 | **コンテキスト事前構築** | プレー前にコンテキスト完成 | コンテキストビルダーコンポーネント、構造化データ設計 |
| 6 | **NFR-006: 互換性** | iOS Safari + Android Chrome + PC | Next.js SSR + レスポンシブCSS |

---

## System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Client Layer                      │
│  ┌──────────────┐         ┌──────────────────────┐  │
│  │  PC Browser  │         │  Mobile Browser      │  │
│  │  (準備/振返り)│         │  (プレー中)           │  │
│  └──────┬───────┘         └──────────┬───────────┘  │
│         └──────────┬─────────────────┘              │
└────────────────────┼────────────────────────────────┘
                     │ HTTPS
┌────────────────────┼────────────────────────────────┐
│              Vercel (Application Layer)              │
│  ┌─────────────────┴───────────────────────────┐    │
│  │           Next.js App Router                 │    │
│  │  ┌──────────┐ ┌───────────┐ ┌────────────┐  │    │
│  │  │  Pages   │ │  Server   │ │   API      │  │    │
│  │  │(React SSR)│ │  Actions  │ │  Routes    │  │    │
│  │  └──────────┘ └───────────┘ └─────┬──────┘  │    │
│  └───────────────────────────────────┼──────────┘    │
└──────────────────────────────────────┼───────────────┘
                     ┌─────────────────┼──────────┐
                     │                 │          │
              ┌──────▼──────┐  ┌──────▼───┐ ┌────▼─────────┐
              │  Supabase   │  │ Gemini   │ │ 楽天GORA     │
              │  (DB+Auth)  │  │ API      │ │ API          │
              │  PostgreSQL │  │ Flash-   │ │              │
              │  + RLS      │  │ Lite     │ │              │
              └─────────────┘  └──────────┘ └──────────────┘
```

### Architecture Diagram (Component Detail)

```
┌─ Next.js Application ──────────────────────────────────────┐
│                                                            │
│  ┌─ Pages (App Router) ──────────────────────────────────┐ │
│  │                                                       │ │
│  │  /                    → ダッシュボード                  │ │
│  │  /play                → プレー中画面（モバイル最適化）   │ │
│  │  /play/[roundId]      → ラウンド進行                   │ │
│  │  /courses             → コース検索・管理               │ │
│  │  /courses/[id]        → コース詳細・ホール別メモ        │ │
│  │  /rounds              → ラウンド履歴                   │ │
│  │  /rounds/[id]         → ラウンド振り返り               │ │
│  │  /profile             → プロファイル管理               │ │
│  │  /knowledge           → ナレッジベース管理             │ │
│  │  /auth                → ログイン/サインアップ           │ │
│  │                                                       │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌─ Server Actions / API Routes ─────────────────────────┐ │
│  │                                                       │ │
│  │  actions/advice.ts    → AIアドバイス生成               │ │
│  │  actions/score.ts     → スコア記録                     │ │
│  │  actions/context.ts   → コンテキスト構築               │ │
│  │  api/courses/         → 楽天GORA API Proxy            │ │
│  │                                                       │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌─ Shared Libraries ───────────────────────────────────┐  │
│  │                                                      │  │
│  │  lib/supabase.ts      → Supabaseクライアント          │  │
│  │  lib/gemini.ts        → Gemini APIクライアント        │  │
│  │  lib/context-builder.ts → コンテキスト構築ロジック     │  │
│  │  lib/rakuten-gora.ts  → 楽天GORA APIクライアント      │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### Architectural Pattern

**Pattern:** Modular Monolith（Next.js フルスタック）

**Rationale:**

| 選定理由 | 詳細 |
|---------|------|
| 開発効率 | フロントエンド＋バックエンドを1つのコードベースで管理。個人開発に最適 |
| コスト | Vercel無料枠でホスティング。別途バックエンドサーバー不要 |
| シンプルさ | マイクロサービスの複雑さを回避。Level 3プロジェクトには十分 |
| デプロイ | git push で自動デプロイ。CI/CDの追加設定不要 |
| 将来の拡張 | モジュール分割されているため、必要時にサービス分離が可能 |

---

## Technology Stack

### Frontend

**Choice:** Next.js 15 (App Router) + React 19 + Tailwind CSS 4

**Rationale:**
- App Router: Server Components による初期表示高速化（NFR-001）
- React 19: Server Actions でフォーム処理がシンプルに
- Tailwind CSS: レスポンシブデザインの実装効率が高い（NFR-002, NFR-006）
- Web Speech API: ブラウザ内蔵の音声認識/読み上げを利用（追加コスト¥0）

**Trade-offs:**
- 得: SSR/SSGによる高速表示、Server Actionsでの簡潔なデータ操作、Vercelとの最適統合
- 失: App Routerの学習コスト、React Server Componentsの制約理解が必要

**主要ライブラリ:**

| ライブラリ | 用途 |
|-----------|------|
| `@supabase/ssr` | Supabase認証統合 |
| `ai` (Vercel AI SDK) | Gemini APIストリーミング統合（OpenAI互換） |
| `tailwindcss` | スタイリング |
| `lucide-react` | アイコン |
| `recharts` | スコア統計グラフ |

### Backend

**Choice:** Next.js API Routes + Server Actions

**Rationale:**
- Server Actions: スコア記録、プロファイル更新などのCRUD操作に最適
- API Routes: Gemini API呼び出し、楽天GORA API Proxyに使用
- 専用バックエンドサーバー不要 → コスト¥0（NFR-008）

**Trade-offs:**
- 得: フロントエンドと同一コードベース、Vercel無料枠内で動作
- 失: 長時間処理（10秒超）はVercel無料枠の制限に注意

### Database

**Choice:** Supabase (PostgreSQL + Auth + Row Level Security)

**Rationale:**

| 機能 | Supabase無料枠 | 用途 |
|------|----------------|------|
| PostgreSQL | 500MB | 全データ保存 |
| Authentication | 50,000 MAU | ユーザー認証（FR-016） |
| Row Level Security | 含む | ユーザーデータ分離（NFR-003） |
| Realtime | 含む | マルチデバイス同期（FR-017） |
| Storage | 1GB | コースレイアウト画像キャッシュ |

**Trade-offs:**
- 得: PostgreSQL + Auth + RLS + Realtimeが無料。マネージドサービスで運用負荷ゼロ
- 失: 無料枠の制限（500MB DB、同時接続50）、Supabaseへのベンダー依存

**データ容量見積もり:**

| データ | 1ラウンド | 年間50ラウンド | 5年分 |
|-------|----------|--------------|-------|
| スコアデータ | ~2KB | ~100KB | ~500KB |
| メモ・反省 | ~5KB | ~250KB | ~1.25MB |
| コース情報 | ~10KB/コース | ~200KB (20コース) | ~500KB |
| プロファイル | ~5KB | ~5KB | ~5KB |
| ナレッジベース | - | ~100KB | ~500KB |
| **合計** | | | **~3MB** |

500MB制限に対して十分余裕あり。

### Infrastructure

**Choice:** Vercel (Free Tier)

| 項目 | Vercel無料枠 | 本アプリ想定 |
|------|-------------|-------------|
| バンドワイド | 100GB/月 | ~1GB/月 |
| Serverless Functions | 100GB-Hrs/月 | ~5GB-Hrs/月 |
| ビルド時間 | 6,000分/月 | ~100分/月 |
| エッジ実行 | 500,000回/月 | ~10,000回/月 |

**Rationale:**
- Next.jsの開発元であるVercelとの最適統合
- git pushで自動デプロイ（CI/CD不要）
- Edge Functionsでグローバルに低レイテンシ
- 完全無料（NFR-008）

### Third-Party Services

| サービス | 用途 | コスト | FR/NFR |
|---------|------|--------|--------|
| **Google Gemini API** (Flash-Lite) | プレー中AIアドバイス | 無料（1,000 RPD） | FR-001, FR-002, FR-003 |
| **楽天GORA API** | コース検索・情報取得 | 無料 | FR-010 |
| **Web Speech API** | 音声認識・読み上げ | 無料（ブラウザ内蔵） | FR-004, FR-005 |
| **Supabase Auth** | ユーザー認証 | 無料（50K MAU） | FR-016 |

### Development & Deployment

| カテゴリ | ツール |
|---------|-------|
| バージョン管理 | Git + GitHub |
| パッケージ管理 | pnpm |
| 言語 | TypeScript (strict) |
| リンター | ESLint + Prettier |
| テスト | Vitest + Playwright |
| CI/CD | Vercel自動デプロイ（GitHub連携） |
| 監視 | Vercel Analytics（無料） |

---

## System Components

### Component 1: AIアドバイスエンジン

**Purpose:** プレー中のAIアドバイス生成のコア

**Responsibilities:**
- コンテキスト（システムプロンプト）の構築
- ユーザー入力（状況）からプロンプトの組み立て
- Gemini API呼び出し（OpenAI互換形式）
- レスポンスのパース・整形

**Interfaces:**
- Server Action: `generateAdvice(roundId, situation)`
- Input: ホール番号、ショット種別、残り距離、ライ、状況タグ
- Output: 推奨クラブ、戦略、注意点（構造化JSON）

**Dependencies:**
- Supabase（プロファイル、コース情報、ナレッジ、スコア取得）
- Gemini API（アドバイス生成）

**FRs Addressed:** FR-001, FR-002, FR-003

**コンテキスト構築の詳細:**

```
System Prompt 構成（推定 5,000〜10,000トークン）:

1. 役割定義（~200トークン）
   "あなたはプロのゴルフキャディーです..."

2. プレーヤープロファイル（~500トークン）
   - クラブ別飛距離テーブル
   - 苦手クラブ、ミス傾向
   - 疲労時の傾向

3. 当日コース情報（~3,000トークン）
   - 全18ホール: Par、距離、レイアウト特徴
   - ホール別メモ（攻略法、注意点）

4. ナレッジベース（~2,000トークン）
   - 状況別スイング注意点
   - メンタル管理のポイント

5. 本日の進行状況（~500トークン）
   - 現在のスコア推移
   - 直近のショット結果
   - 推定疲労度

6. レスポンス形式指定（~200トークン）
   JSON形式でクラブ推奨、戦略、注意点を返す
```

---

### Component 2: スコア記録エンジン

**Purpose:** プレー中のスコア・ショットデータの記録と管理

**Responsibilities:**
- ホール別スコア入力の処理
- ショット結果の記録
- 反省メモの保存（音声→テキスト変換後）
- リアルタイムでのDB保存

**Interfaces:**
- Server Action: `recordScore(roundId, holeNumber, data)`
- Server Action: `recordShot(roundId, holeNumber, shotData)`
- Server Action: `saveMemo(roundId, holeNumber, memoText)`

**Dependencies:**
- Supabase（データ保存）

**FRs Addressed:** FR-006, FR-007, FR-008

---

### Component 3: コース情報マネージャー

**Purpose:** ゴルフ場情報の検索・取得・管理

**Responsibilities:**
- 楽天GORA APIからコース検索
- コース基本情報の取得・キャッシュ
- ホール別メモの管理
- コースレイアウト画像の表示

**Interfaces:**
- API Route: `GET /api/courses/search?q=コース名`
- Server Action: `saveCourseNote(courseId, holeNumber, note)`

**Dependencies:**
- 楽天GORA API（コース検索）
- Supabase（コース情報・メモ保存）

**FRs Addressed:** FR-010, FR-011

---

### Component 4: ユーザープロファイルマネージャー

**Purpose:** ユーザーのゴルフ特性データの管理

**Responsibilities:**
- クラブ別飛距離の登録・更新
- 苦手クラブ、ミス傾向の管理
- 状況別傾向の自由記述管理
- プロファイルデータのコンテキスト変換

**Interfaces:**
- Server Action: `updateProfile(userId, profileData)`
- Internal: `buildProfileContext(userId)` → AIアドバイスエンジンに提供

**Dependencies:**
- Supabase（データ保存）

**FRs Addressed:** FR-009

---

### Component 5: 音声I/Oハンドラー

**Purpose:** 音声入力・読み上げのブラウザAPI統合

**Responsibilities:**
- Web Speech Recognition APIによる音声→テキスト変換
- Web Speech Synthesis APIによるテキスト→音声読み上げ
- 日本語認識の設定・最適化

**Interfaces:**
- React Hook: `useSpeechRecognition()` → テキスト返却
- React Hook: `useSpeechSynthesis()` → 読み上げ制御

**Dependencies:**
- ブラウザ Web Speech API（外部サービス不要）

**FRs Addressed:** FR-004, FR-005

---

### Component 6: ラウンド振り返りビューア

**Purpose:** ラウンド後のデータ閲覧・統計表示

**Responsibilities:**
- ホール別スコア一覧表示
- 反省メモ一覧表示
- 統計計算（FWキープ率、パーオン率、平均パット数等）
- スコアデータのエクスポート（Claudeサブスクへのコピー用）

**Interfaces:**
- Page: `/rounds/[id]`
- Server Component: データ取得＋SSR

**Dependencies:**
- Supabase（スコアデータ取得）

**FRs Addressed:** FR-014, FR-015（統計表示部分。AI傾向分析はClaudeサブスクで手動実施）

---

### Component 7: ナレッジベースマネージャー

**Purpose:** ゴルフ知見の構造化管理

**Responsibilities:**
- 知見のCRUD操作
- カテゴリ・タグによる分類
- 状況タグでの検索
- コンテキスト構築時の知見抽出

**Interfaces:**
- Page: `/knowledge`
- Server Action: `saveKnowledge(data)`
- Internal: `buildKnowledgeContext(tags[])` → AIアドバイスエンジンに提供

**Dependencies:**
- Supabase（データ保存・検索）

**FRs Addressed:** FR-013（手動登録。FR-012のYouTube分析はClaudeサブスクで実施、結果を手動登録）

---

### Component 8: 認証・ユーザー管理

**Purpose:** ユーザー登録・ログイン・セッション管理

**Responsibilities:**
- メール/パスワードによるサインアップ・ログイン
- セッション管理（JWT）
- パスワードリセット
- Row Level Security（RLS）によるデータアクセス制御

**Interfaces:**
- Page: `/auth`
- Middleware: 認証チェック
- Supabase Auth SDK

**Dependencies:**
- Supabase Auth

**FRs Addressed:** FR-016, FR-017

---

## Data Architecture

### Data Model

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   users      │     │   profiles   │     │   clubs         │
│─────────────│     │──────────────│     │─────────────────│
│ id (PK)      │──┐  │ id (PK)      │     │ id (PK)         │
│ email        │  │  │ user_id (FK) │──┐  │ profile_id (FK) │
│ created_at   │  │  │ handicap     │  │  │ name            │
└──────────────┘  │  │ play_style   │  │  │ distance        │
                  │  │ miss_tendency │  │  │ is_weak         │
                  │  │ fatigue_note │  │  │ confidence      │
                  │  └──────────────┘  │  └─────────────────┘
                  │                    │
                  │  ┌──────────────┐  │  ┌─────────────────┐
                  │  │   courses    │  │  │   holes         │
                  │  │──────────────│  │  │─────────────────│
                  │  │ id (PK)      │  │  │ id (PK)         │
                  │  │ gora_id      │  │  │ course_id (FK)  │
                  │  │ name         │  │  │ hole_number     │
                  │  │ prefecture   │  │  │ par             │
                  │  │ layout_url   │  │  │ distance        │
                  │  └──────┬───────┘  │  │ description     │
                  │         │          │  └─────────────────┘
                  │         │          │
                  │  ┌──────▼───────┐  │  ┌─────────────────┐
                  │  │ course_notes │  │  │ hole_notes      │
                  │  │──────────────│  │  │─────────────────│
                  │  │ id (PK)      │  │  │ id (PK)         │
                  └──│ user_id (FK) │  │  │ user_id (FK)    │
                     │ course_id(FK)│  │  │ hole_id (FK)    │
                     │ note         │  │  │ note            │
                     └──────────────┘  │  │ strategy        │
                                       │  └─────────────────┘
                  ┌────────────────────┘
                  │
┌─────────────────▼──┐     ┌──────────────────┐
│   rounds           │     │   scores         │
│────────────────────│     │──────────────────│
│ id (PK)            │──┐  │ id (PK)          │
│ user_id (FK)       │  │  │ round_id (FK)    │
│ course_id (FK)     │  │  │ hole_number      │
│ played_at          │  │  │ strokes          │
│ context_snapshot   │  │  │ putts            │
│ total_score        │  │  │ fairway_hit      │
└────────────────────┘  │  │ green_in_reg     │
                        │  └──────────────────┘
                        │
                        │  ┌──────────────────┐
                        │  │   shots          │
                        │  │──────────────────│
                        ├──│ id (PK)          │
                        │  │ round_id (FK)    │
                        │  │ hole_number      │
                        │  │ shot_number      │
                        │  │ club             │
                        │  │ result           │
                        │  │ miss_type        │
                        │  │ created_at       │
                        │  └──────────────────┘
                        │
                        │  ┌──────────────────┐
                        │  │   memos          │
                        │  │──────────────────│
                        └──│ id (PK)          │
                           │ round_id (FK)    │
                           │ hole_number      │
                           │ content          │
                           │ source           │
                           │ created_at       │
                           └──────────────────┘

┌────────────────────┐
│   knowledge        │
│────────────────────│
│ id (PK)            │
│ user_id (FK)       │
│ title              │
│ content            │
│ category           │
│ tags (text[])      │
│ source_url         │
│ created_at         │
└────────────────────┘
```

### Database Design

**テーブル定義:**

```sql
-- ユーザープロファイル
create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  handicap numeric(3,1),
  play_style text,          -- 攻撃的/安定型等
  miss_tendency text,       -- 力むとフック、打ち下ろしでフック等
  fatigue_note text,        -- 疲労時の傾向
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- クラブ情報
create table clubs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade not null,
  name text not null,       -- 1W, 3W, 5I, 7I, PW, SW 等
  distance integer,         -- 平均飛距離(yd)
  is_weak boolean default false,  -- 苦手クラブ
  confidence integer default 3,   -- 自信度 1-5
  note text
);

-- コース情報
create table courses (
  id uuid primary key default gen_random_uuid(),
  gora_id text unique,      -- 楽天GORA ID
  name text not null,
  prefecture text,
  address text,
  layout_url text,          -- コースレイアウト画像URL
  raw_data jsonb,           -- GORA API レスポンス全体
  created_at timestamptz default now()
);

-- ホール情報
create table holes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade not null,
  hole_number integer not null check (hole_number between 1 and 18),
  par integer not null check (par between 3 and 5),
  distance integer,         -- ヤーデージ
  description text,         -- ドッグレッグ左、打ち下ろし等
  unique (course_id, hole_number)
);

-- ホール別ユーザーメモ
create table hole_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  hole_id uuid references holes(id) on delete cascade not null,
  note text,
  strategy text,            -- 攻略法
  updated_at timestamptz default now(),
  unique (user_id, hole_id)
);

-- ラウンド
create table rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  course_id uuid references courses(id) not null,
  played_at date not null default current_date,
  context_snapshot jsonb,   -- プレー開始時のコンテキストスナップショット
  total_score integer,
  status text default 'in_progress' check (status in ('in_progress', 'completed')),
  created_at timestamptz default now()
);

-- ホール別スコア
create table scores (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id) on delete cascade not null,
  hole_number integer not null check (hole_number between 1 and 18),
  strokes integer check (strokes between 1 and 20),
  putts integer check (putts between 0 and 10),
  fairway_hit boolean,
  green_in_reg boolean,
  unique (round_id, hole_number)
);

-- ショット記録
create table shots (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id) on delete cascade not null,
  hole_number integer not null,
  shot_number integer not null,
  club text,
  result text check (result in ('excellent', 'good', 'fair', 'poor')),
  miss_type text,           -- hook, slice, duff, top, shank 等
  created_at timestamptz default now()
);

-- メモ
create table memos (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id) on delete cascade not null,
  hole_number integer,
  content text not null,
  source text default 'voice' check (source in ('voice', 'text')),
  created_at timestamptz default now()
);

-- ナレッジベース
create table knowledge (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  content text not null,
  category text not null,   -- swing, course_management, mental, practice
  tags text[] default '{}', -- バンカー, 打ち下ろし, 風, 雨 等
  source_url text,          -- YouTube URL等
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Row Level Security
alter table profiles enable row level security;
alter table clubs enable row level security;
alter table hole_notes enable row level security;
alter table rounds enable row level security;
alter table scores enable row level security;
alter table shots enable row level security;
alter table memos enable row level security;
alter table knowledge enable row level security;

-- RLS Policies（全テーブル共通パターン）
-- ユーザーは自分のデータのみアクセス可能
create policy "Users can CRUD own data" on profiles
  for all using (auth.uid() = user_id);
-- （他テーブルも同様のポリシーを適用）

-- courses, holes はパブリック読み取り可能
create policy "Courses are readable by all" on courses
  for select using (true);
create policy "Holes are readable by all" on holes
  for select using (true);
```

**インデックス:**

```sql
create index idx_rounds_user_id on rounds(user_id);
create index idx_rounds_played_at on rounds(played_at desc);
create index idx_scores_round_id on scores(round_id);
create index idx_shots_round_id on shots(round_id);
create index idx_knowledge_user_tags on knowledge using gin(tags);
create index idx_knowledge_user_category on knowledge(user_id, category);
```

### Data Flow

```
【コンテキスト構築フロー（ラウンド開始時）】

profiles + clubs
    ↓
course + holes + hole_notes
    ↓
knowledge (タグ検索)
    ↓
recent rounds + scores (傾向データ)
    ↓
context-builder.ts が JSON として組み立て
    ↓
rounds.context_snapshot に保存（スナップショット）
    ↓
プレー中は context_snapshot を再利用


【プレー中データフロー】

ユーザー入力（ボタン/音声）
    ↓
Server Action (advice.ts)
    ├→ context_snapshot 取得（Supabase）
    ├→ 現在のスコア状況取得（Supabase）
    ├→ プロンプト組み立て
    └→ Gemini API 呼び出し
        ↓
    AIレスポンス
        ↓
    クライアントに返却（ストリーミング）
        ↓
    テキスト表示 + 音声読み上げ

ショット結果入力（ボタン）
    ↓
Server Action (score.ts)
    ↓
Supabase に即時保存
```

---

## API Design

### API Architecture

- **Server Actions（主要）:** スコア記録、プロファイル更新、メモ保存などのミューテーション操作
- **API Routes（補助）:** 楽天GORA APIプロキシ、Gemini APIストリーミング
- **認証:** Supabase Auth JWT（自動管理）
- **レスポンス形式:** JSON
- **LLM呼び出し:** Vercel AI SDK（OpenAI互換形式）でGemini APIを呼び出し。将来のプロバイダー切り替えに対応

### Endpoints

**Server Actions（型安全、直接呼び出し）:**

```typescript
// AIアドバイス
actions/advice.ts
  generateAdvice(roundId: string, situation: ShotSituation): StreamableValue<AdviceResponse>

// スコア記録
actions/score.ts
  recordHoleScore(roundId: string, holeNumber: number, data: HoleScore): void
  recordShot(roundId: string, data: ShotRecord): void
  saveMemo(roundId: string, holeNumber: number, content: string): void

// ラウンド管理
actions/round.ts
  startRound(courseId: string): Round
  completeRound(roundId: string): Round

// コンテキスト
actions/context.ts
  buildContext(roundId: string): RoundContext

// プロファイル
actions/profile.ts
  updateProfile(data: ProfileUpdate): void
  updateClubs(data: ClubUpdate[]): void

// ナレッジ
actions/knowledge.ts
  saveKnowledge(data: KnowledgeEntry): void
  deleteKnowledge(id: string): void
```

**API Routes（外部API連携）:**

```
GET  /api/courses/search?q={query}     楽天GORA コース検索
GET  /api/courses/{goraId}             楽天GORA コース詳細取得
POST /api/advice/stream                Gemini AIアドバイス（ストリーミング）
```

### Authentication & Authorization

```
認証フロー:

1. サインアップ/ログイン
   Client → Supabase Auth → JWT発行 → Cookieに保存

2. リクエスト認証
   Client → Next.js Middleware → JWT検証 → Server Action/API Route

3. データアクセス制御
   Server Action → Supabase Client (with JWT) → RLSが自動フィルタ

4. 未認証アクセス
   → /auth にリダイレクト
```

- **認証方式:** Supabase Auth（メール/パスワード）
- **セッション管理:** HTTPOnly Cookie（JWT）
- **データ保護:** PostgreSQL Row Level Security（RLS）で全テーブルのアクセスを制御
- **API保護:** Next.js Middlewareで認証チェック

---

## Non-Functional Requirements Coverage

### NFR-001: Performance - レスポンス時間

**Requirement:** UIレスポンス200ms以内、AIアドバイス5秒以内、スコア保存1秒以内

**Architecture Solution:**
- **UI:** React Server Components で初期表示を高速化。クライアントコンポーネントは必要最小限
- **AI:** Gemini Flash-Lite は TTFT ~0.3秒。ストリーミングレスポンスで体感速度を向上（最初の文字が0.5秒で表示開始）
- **DB:** Supabaseへの直接保存。楽観的UI更新（保存完了を待たずにUI反映）

**Validation:**
- Vercel Analytics でレスポンス時間を監視
- Gemini API のレイテンシをログ記録

---

### NFR-002: Usability - プレー中の操作性

**Requirement:** 2タップ以内、片手操作、屋外視認性

**Architecture Solution:**
- **モバイルファーストUI:** `/play` ルートは専用のモバイル最適化レイアウト
- **大きなタッチターゲット:** 最小48px（Tailwind `min-h-12 min-w-12`）
- **高コントラスト:** ダークテーマベース + 大きなフォント（18px基本）
- **状態管理:** 現在のホール・ショット状態をURLパラメータで管理（ブラウザバック対応）

**Implementation Notes:**
- プレー画面（`/play`）とPC画面（その他）で異なるレイアウトを使用
- プレー画面はボトムナビゲーション＋大きなボタンUI

---

### NFR-003: Security - データ保護

**Requirement:** パスワードハッシュ化、HTTPS、ユーザーデータ分離

**Architecture Solution:**
- **パスワード:** Supabase Authが bcrypt でハッシュ化（自動）
- **HTTPS:** Vercelが自動でSSL証明書を発行・管理
- **データ分離:** PostgreSQL RLS でユーザー単位のアクセス制御
- **API保護:** Server Actions は自動的にCSRF保護。APIキー（Gemini, GORA）はサーバーサイドのみ

---

### NFR-004: Scalability - ユーザー数対応

**Requirement:** 同時100ユーザー、スケールアウト可能

**Architecture Solution:**
- **Vercel:** Serverless Functions は自動スケール
- **Supabase:** 接続プーリング（PgBouncer）で同時接続管理
- **Gemini API:** ユーザーごとに独立したAPIキーも可能

**Validation:**
- 無料枠の制限内で小規模展開。制限に達した場合はSupabase Pro（$25/月）に移行

---

### NFR-005: Reliability - データ永続性

**Requirement:** 即時保存、ネットワーク切断時のバッファ

**Architecture Solution:**
- **即時保存:** Server Actions で入力ごとにSupabaseへ保存
- **楽観的更新:** UIは即座に反映し、バックグラウンドで保存
- **ローカルバッファ:** `localStorage` にスコアデータを一時保存。再接続時にサーバーと同期
- **バックアップ:** Supabase は自動日次バックアップ（無料枠に含む）

**Implementation Notes:**

```typescript
// 楽観的更新 + ローカルバッファの疑似コード
async function recordScore(data: HoleScore) {
  // 1. UIを即座に更新
  updateLocalState(data);
  // 2. localStorageに保存（バッファ）
  saveToLocalStorage(data);
  // 3. サーバーに保存
  try {
    await serverAction.recordHoleScore(data);
    removeFromLocalStorage(data);
  } catch (error) {
    // オフライン時: localStorageに保持、再接続時にリトライ
    queueForSync(data);
  }
}
```

---

### NFR-006: Compatibility - ブラウザ・デバイス対応

**Requirement:** iOS Safari, Android Chrome, PC Chrome/Edge

**Architecture Solution:**
- **Next.js SSR:** サーバーサイドレンダリングでブラウザ依存を最小化
- **Tailwind CSS:** レスポンシブブレイクポイント（`sm:`, `md:`, `lg:`）
- **Web Speech API:** iOS Safari, Android Chrome でサポート済み（ポリフィル不要）
- **テスト:** Playwright で主要ブラウザの自動テスト

---

### NFR-007: Maintainability - コード品質

**Requirement:** テストカバレッジ60%、コンポーネント分離、API文書

**Architecture Solution:**
- **TypeScript strict:** 型安全で保守性向上
- **コンポーネント分離:** 機能別ディレクトリ構成（後述）
- **テスト:** Vitest（ユニット）+ Playwright（E2E）
- **API文書:** Server Actions の TypeScript型定義がドキュメントを兼ねる

---

### NFR-008: Cost - 運用コスト最小化

**Requirement:** 月額¥0運用

**Architecture Solution:**

| サービス | 無料枠 | 本アプリ消費量 | 余裕 |
|---------|--------|--------------|------|
| Vercel | 100GB BW, 100GB-Hrs | ~1GB BW, ~5GB-Hrs | 十分 |
| Supabase | 500MB DB, 50K MAU | ~3MB DB, ~10 MAU | 十分 |
| Gemini API | 1,000 RPD | ~30 RPD (1ラウンド) | 十分 |
| 楽天GORA API | 無料 | ~10回/月 | 十分 |

**月額コスト: ¥0**

---

## Security Architecture

### Authentication

- **方式:** Supabase Auth（メール/パスワード）
- **セッション:** JWT（HTTPOnly Cookie）、有効期限1時間、自動リフレッシュ
- **パスワード要件:** 最低8文字
- **パスワードリセット:** Supabase Auth 内蔵のメールリセットフロー

### Authorization

- **方式:** Row Level Security（RLS）
- **ルール:** 全テーブルで `auth.uid() = user_id` ポリシーを適用
- **例外:** `courses`, `holes` テーブルは全ユーザーが読み取り可能（共有データ）

### Data Encryption

- **通信時:** TLS 1.3（Vercel + Supabase が自動管理）
- **保存時:** Supabase PostgreSQL はディスク暗号化（AES-256）
- **APIキー:** 環境変数で管理（Vercel Environment Variables）。クライアントに露出しない

### Security Best Practices

- Server Actions は自動的にCSRF保護
- APIキー（Gemini, GORA）はサーバーサイドのみで使用
- `Content-Security-Policy` ヘッダーで XSS 対策
- Supabase の入力バリデーション + TypeScript 型チェック
- 依存パッケージの脆弱性スキャン（`pnpm audit`）

---

## Scalability & Performance

### Scaling Strategy

- **水平スケーリング:** Vercel Serverless Functions は自動スケール（設定不要）
- **DB接続:** Supabase PgBouncer で接続プーリング
- **将来:** ユーザー増加時は Supabase Pro ($25/月) で接続数・DB容量を拡張

### Performance Optimization

- **Server Components:** 初期表示でのJavaScriptバンドルサイズ削減
- **ストリーミング:** AIアドバイスは Streaming で段階的表示
- **楽観的UI:** スコア保存は即座にUI反映（サーバー応答を待たない）
- **データフェッチ:** Server Components でのサーバーサイドデータ取得（Waterfall回避）

### Caching Strategy

- **コース情報:** Supabaseに保存（楽天GORA APIを毎回呼ばない）
- **コンテキスト:** ラウンド開始時に `context_snapshot` として保存。プレー中は再構築不要
- **静的アセット:** Vercel CDN で自動キャッシュ

### Load Balancing

- Vercel が自動管理（設定不要）
- Edge Network でグローバルに低レイテンシ

---

## Reliability & Availability

### High Availability Design

- **Vercel:** 99.99% SLA（Pro以上）、無料枠でも高い可用性
- **Supabase:** マネージドPostgreSQLで自動フェイルオーバー
- **単一障害点の回避:** サーバーレスアーキテクチャにより、個別のサーバー障害影響なし

### Disaster Recovery

- **RPO:** 24時間（Supabase日次自動バックアップ）
- **RTO:** 数分（Supabase Point-in-Time Recovery、Pro版）
- **無料枠:** 日次バックアップのみ。手動エクスポートで補完

### Backup Strategy

- Supabase 自動日次バックアップ（無料枠に含む）
- 月次の手動データエクスポート推奨

### Monitoring & Alerting

- **Vercel Analytics:** ページロード時間、Web Vitals
- **Vercel Logs:** Serverless Function エラーログ
- **Supabase Dashboard:** DB使用量、接続数
- **アラート:** Vercel のデプロイ失敗通知（GitHub連携）

---

## Integration Architecture

### External Integrations

**1. Google Gemini API**

```typescript
// lib/gemini.ts - OpenAI互換形式
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText } from 'ai';

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export async function generateAdvice(
  context: RoundContext,
  situation: ShotSituation
) {
  const result = streamText({
    model: google('gemini-2.0-flash-lite'),
    system: buildSystemPrompt(context),
    prompt: buildUserPrompt(situation),
    maxTokens: 300,
  });
  return result;
}
```

**プロバイダー切り替え対応:**

```typescript
// 将来OpenRouter等に切り替える場合
import { createOpenAI } from '@ai-sdk/openai';

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});
// model パラメータを変更するだけで切り替え可能
```

**2. 楽天GORA API**

```typescript
// lib/rakuten-gora.ts
const GORA_BASE = 'https://app.rakuten.co.jp/services/api/Gora';

export async function searchCourses(keyword: string) {
  const params = new URLSearchParams({
    applicationId: process.env.RAKUTEN_APP_ID!,
    keyword,
    format: 'json',
  });
  const res = await fetch(
    `${GORA_BASE}/GoraGolfCourseSearch/20170623?${params}`
  );
  return res.json();
}

export async function getCourseDetail(goraGolfCourseId: string) {
  const params = new URLSearchParams({
    applicationId: process.env.RAKUTEN_APP_ID!,
    goraGolfCourseId,
    format: 'json',
  });
  const res = await fetch(
    `${GORA_BASE}/GoraGolfCourseDetail/20170623?${params}`
  );
  return res.json();
}
```

**3. Web Speech API（ブラウザ内蔵）**

```typescript
// hooks/use-speech-recognition.ts
export function useSpeechRecognition() {
  // SpeechRecognition API (ブラウザ内蔵、追加パッケージ不要)
  const recognition = new (
    window.SpeechRecognition || window.webkitSpeechRecognition
  )();
  recognition.lang = 'ja-JP';
  recognition.continuous = false;
  // ...
}

// hooks/use-speech-synthesis.ts
export function useSpeechSynthesis() {
  // SpeechSynthesis API (ブラウザ内蔵)
  const synth = window.speechSynthesis;
  // 日本語音声を選択
  // ...
}
```

### Internal Integrations

**コンテキストビルダー（AIアドバイスエンジンのコア）:**

```typescript
// lib/context-builder.ts
export async function buildRoundContext(
  userId: string,
  courseId: string
): Promise<RoundContext> {
  // 並列取得
  const [profile, clubs, course, holes, holeNotes, knowledge, recentRounds] =
    await Promise.all([
      getProfile(userId),
      getClubs(userId),
      getCourse(courseId),
      getHoles(courseId),
      getHoleNotes(userId, courseId),
      getKnowledge(userId),
      getRecentRounds(userId, 5),
    ]);

  return {
    player: { profile, clubs },
    course: { ...course, holes, notes: holeNotes },
    knowledge,
    history: summarizeRecentRounds(recentRounds),
    builtAt: new Date().toISOString(),
  };
}
```

---

## Development Architecture

### Code Organization

```
golf-assistant/
├── docs/                          # ドキュメント
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── (auth)/                # 認証グループ
│   │   │   ├── login/
│   │   │   └── signup/
│   │   ├── (main)/                # 認証済みグループ
│   │   │   ├── layout.tsx         # 共通レイアウト（PCナビ）
│   │   │   ├── page.tsx           # ダッシュボード
│   │   │   ├── profile/
│   │   │   ├── courses/
│   │   │   │   ├── page.tsx       # コース一覧・検索
│   │   │   │   └── [id]/
│   │   │   ├── rounds/
│   │   │   │   ├── page.tsx       # ラウンド履歴
│   │   │   │   └── [id]/
│   │   │   └── knowledge/
│   │   ├── play/                  # プレー中（モバイル専用レイアウト）
│   │   │   ├── layout.tsx         # モバイル最適化レイアウト
│   │   │   ├── page.tsx           # ラウンド開始
│   │   │   └── [roundId]/
│   │   │       ├── page.tsx       # プレー画面
│   │   │       └── complete/
│   │   ├── api/
│   │   │   ├── courses/
│   │   │   └── advice/
│   │   ├── layout.tsx             # ルートレイアウト
│   │   └── globals.css
│   ├── actions/                   # Server Actions
│   │   ├── advice.ts
│   │   ├── score.ts
│   │   ├── round.ts
│   │   ├── context.ts
│   │   ├── profile.ts
│   │   └── knowledge.ts
│   ├── components/                # UIコンポーネント
│   │   ├── ui/                    # 汎用UI（Button, Card, etc.）
│   │   ├── play/                  # プレー中コンポーネント
│   │   │   ├── advice-display.tsx
│   │   │   ├── score-input.tsx
│   │   │   ├── shot-recorder.tsx
│   │   │   ├── situation-selector.tsx
│   │   │   └── voice-memo.tsx
│   │   ├── course/                # コース関連
│   │   ├── profile/               # プロファイル関連
│   │   └── stats/                 # 統計表示
│   ├── hooks/                     # カスタムフック
│   │   ├── use-speech-recognition.ts
│   │   ├── use-speech-synthesis.ts
│   │   └── use-local-buffer.ts
│   ├── lib/                       # ライブラリ
│   │   ├── supabase/
│   │   │   ├── client.ts          # ブラウザ用クライアント
│   │   │   ├── server.ts          # サーバー用クライアント
│   │   │   └── middleware.ts      # 認証ミドルウェア
│   │   ├── gemini.ts              # Gemini APIクライアント
│   │   ├── rakuten-gora.ts        # 楽天GORA APIクライアント
│   │   └── context-builder.ts     # コンテキスト構築
│   └── types/                     # TypeScript型定義
│       ├── database.ts            # Supabase生成型
│       ├── advice.ts
│       ├── score.ts
│       └── context.ts
├── supabase/
│   ├── migrations/                # DBマイグレーション
│   └── seed.sql                   # 初期データ
├── tests/
│   ├── unit/                      # Vitestユニットテスト
│   └── e2e/                       # Playwright E2Eテスト
├── .env.local                     # 環境変数（ローカル開発用）
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

### Testing Strategy

| テスト種別 | ツール | 対象 | カバレッジ目標 |
|-----------|-------|------|--------------|
| ユニットテスト | Vitest | context-builder, 型変換, ユーティリティ | 80% |
| コンポーネントテスト | Vitest + Testing Library | UIコンポーネント | 60% |
| E2Eテスト | Playwright | スコア記録フロー, ログイン | 主要フロー |
| APIテスト | Vitest | Server Actions, API Routes | 70% |

### CI/CD Pipeline

```
git push to main
    ↓
Vercel Auto Build
    ├→ TypeScript型チェック
    ├→ ESLint
    ├→ Vitest（ユニットテスト）
    └→ ビルド成功 → 自動デプロイ（本番）

git push to feature/*
    ↓
Vercel Preview Deployment
    └→ プレビューURLで動作確認
```

---

## Deployment Architecture

### Environments

| 環境 | URL | 用途 |
|------|-----|------|
| 本番 | `golf-assistant.vercel.app`（カスタムドメイン可） | 実運用 |
| プレビュー | `golf-assistant-*.vercel.app` | PR単位のプレビュー |
| ローカル開発 | `localhost:3000` | 開発・テスト |

### Deployment Strategy

- **本番:** `main` ブランチへのマージで自動デプロイ
- **プレビュー:** PR作成時に自動でプレビュー環境生成
- **ロールバック:** Vercelダッシュボードから1クリックで前バージョンに戻し可能

### Infrastructure as Code

- **Supabase:** `supabase/migrations/` にSQLマイグレーションファイル管理
- **Vercel:** `vercel.json` で設定管理（基本はデフォルトで十分）
- **環境変数:** Vercel Dashboard で管理

```
# 必要な環境変数
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
RAKUTEN_APP_ID=
```

---

## Requirements Traceability

### Functional Requirements Coverage

| FR ID | FR Name | Components | 実装方式 |
|-------|---------|------------|---------|
| FR-001 | ショット戦略アドバイス | AIアドバイスエンジン, プレー画面 | Gemini API + コンテキスト |
| FR-002 | 状況別スイング注意点 | AIアドバイスエンジン, ナレッジBM | ナレッジ → コンテキスト → Gemini |
| FR-003 | 疲労・メンタル考慮 | AIアドバイスエンジン | スコア推移をコンテキストに含める |
| FR-004 | 音声読み上げ | 音声I/Oハンドラー | Web Speech Synthesis API |
| FR-005 | 音声入力 | 音声I/Oハンドラー | Web Speech Recognition API |
| FR-006 | ホール別スコア記録 | スコア記録エンジン, プレー画面 | Server Action → Supabase |
| FR-007 | ショット結果記録 | スコア記録エンジン, プレー画面 | Server Action → Supabase |
| FR-008 | 反省・気づきメモ | スコア記録エンジン, 音声I/O | 音声入力 → Server Action → Supabase |
| FR-009 | ユーザープロファイル | プロファイルマネージャー | CRUD → Supabase |
| FR-010 | コース情報管理 | コース情報マネージャー | 楽天GORA API → Supabase |
| FR-011 | ラウンド前プレビュー | コンテキストビルダー | Claudeサブスクで手動分析 → ホールメモに登録 |
| FR-012 | YouTube動画分析 | ナレッジベースマネージャー | Claudeサブスクで手動分析 → ナレッジに登録 |
| FR-013 | ナレッジベース管理 | ナレッジベースマネージャー | CRUD → Supabase |
| FR-014 | ラウンド振り返り画面 | 振り返りビューア | Server Component → Supabase |
| FR-015 | AI傾向分析 | 振り返りビューア | 統計表示 + Claudeサブスクで手動分析 |
| FR-016 | ユーザー登録・認証 | 認証・ユーザー管理 | Supabase Auth |
| FR-017 | マルチデバイス対応 | 全コンポーネント | レスポンシブCSS + 単一DB |

### Non-Functional Requirements Coverage

| NFR ID | NFR Name | Solution | Validation |
|--------|----------|----------|------------|
| NFR-001 | Performance | SSR + ストリーミング + 楽観的更新 | Vercel Analytics |
| NFR-002 | Usability | モバイルファースト + 大タッチターゲット | Playwright E2Eテスト |
| NFR-003 | Security | Supabase Auth + RLS + HTTPS | RLS policyテスト |
| NFR-004 | Scalability | Serverless + PgBouncer | 負荷テスト（必要時） |
| NFR-005 | Reliability | 楽観的更新 + localStorage バッファ | E2Eテスト |
| NFR-006 | Compatibility | SSR + Tailwind responsive | Playwright multi-browser |
| NFR-007 | Maintainability | TypeScript strict + テスト | カバレッジレポート |
| NFR-008 | Cost | 全サービス無料枠 | 月次使用量確認 |

---

## Trade-offs & Decision Log

### Decision 1: Next.js Modular Monolith vs マイクロサービス

**選択:** Modular Monolith
- 得: 開発速度、デプロイ簡潔さ、コスト¥0
- 失: 大規模スケーリング時の柔軟性
- **根拠:** 個人開発〜少人数利用。マイクロサービスは過剰な複雑さ

### Decision 2: Supabase vs 自前DB (PlanetScale, Neon等)

**選択:** Supabase
- 得: Auth + DB + RLS + Realtime が一体。無料枠が十分
- 失: Supabaseへのベンダーロック。PostgreSQL標準SQLなので移行は可能
- **根拠:** 認証とDBを別々に管理するよりシンプル。無料枠が最も充実

### Decision 3: Gemini Flash-Lite vs より高性能なモデル

**選択:** Gemini Flash-Lite
- 得: 無料枠1,000 RPD、高速レスポンス、低コスト
- 失: 高度な推論能力は劣る
- **根拠:** コンテキスト事前構築型なので、モデルには「整理済み情報から短いアドバイスを生成する」だけの能力で十分。品質不足の場合はFlashに切り替え可能

### Decision 4: Server Actions vs 従来のREST API

**選択:** Server Actions（主要）+ API Routes（補助）
- 得: 型安全、ボイラープレート削減、自動CSRF保護
- 失: Next.jsへのロックイン
- **根拠:** 開発効率を最優先。API Routesも併用するため、将来の分離も可能

### Decision 5: 全機能クラウド vs ローカル/クラウドハイブリッド

**選択:** 全機能クラウド
- 得: データ同期不要、シンプルなアーキテクチャ、どこからでもアクセス
- 失: インターネット接続が常時必要
- **根拠:** 全サービス無料枠で運用できるため、コストメリットなし。シンプルさを優先

---

## Open Issues & Risks

| # | リスク | 影響 | 対策 |
|---|-------|------|------|
| 1 | Gemini API無料枠の縮小・廃止 | プレー中AI機能のコスト増 | OpenAI互換形式で実装。OpenRouterや他モデルへ即座に切り替え可能 |
| 2 | Supabase無料枠の変更 | DB・認証のコスト増 | PostgreSQL標準なので他マネージドDBへ移行可能 |
| 3 | Vercel無料枠の制限強化 | ホスティングコスト増 | Cloudflare Pages等へ移行可能（Next.js対応） |
| 4 | Web Speech APIのゴルフ用語認識精度 | 音声入力の実用性 | 認識結果の手動修正UI。将来的にWhisper API等の検討 |
| 5 | 楽天GORA APIのホール別詳細データ不足 | コース情報の精度 | 手動入力での補完。コミュニティデータの活用 |

---

## Assumptions & Constraints

### Assumptions

1. ゴルフ場でのスマートフォン通信は十分な速度がある
2. Gemini Flash-Liteの日本語品質はゴルフアドバイスに十分
3. Web Speech API の日本語認識がゴルフ用語に対応できる
4. Vercel, Supabase, Gemini APIの無料枠が大幅に変更されない
5. 月間50ラウンド未満の利用（無料枠内）

### Constraints

1. 全サービスを無料枠内で運用する（月額¥0目標）
2. 個人開発のため、運用負荷を最小化する（マネージドサービス優先）
3. プレー中の操作は2タップ以内に制限する

---

## Future Considerations

1. **GPS連携:** OpenStreetMapデータとGeolocation APIを活用した残り距離自動計測
2. **スマートウォッチ対応:** PWA化によるApple Watch/Wear OS対応
3. **仲間展開:** コース攻略メモの共有機能
4. **AI傾向分析の自動化:** Claudeサブスク→アプリ内Gemini APIでの自動分析
5. **オフライン対応:** Service Worker + IndexedDB によるオフラインサポート
6. **カスタムドメイン:** Vercelでの独自ドメイン設定

---

## Approval & Sign-off

**Review Status:**
- [ ] Product Owner (kishida)

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-20 | kishida | Initial architecture |

---

## Next Steps

### Phase 4: Sprint Planning & Implementation

Run `/sprint-planning` to:
- Break epics into detailed user stories
- Estimate story complexity
- Plan sprint iterations
- Begin implementation following this architectural blueprint

**Key Implementation Principles:**
1. Follow component boundaries defined in this document
2. Implement NFR solutions as specified
3. Use technology stack as defined
4. Follow API contracts exactly
5. Adhere to security and performance guidelines

**Recommended Sprint Order:**
1. Sprint 1: プロジェクトセットアップ + 認証 (EPIC-001の一部)
2. Sprint 2: プロファイル管理 (EPIC-001の残り)
3. Sprint 3: コース情報管理 (EPIC-002)
4. Sprint 4: スコア記録 (EPIC-004)
5. Sprint 5: AIキャディー (EPIC-003)
6. Sprint 6: 振り返り・統計 (EPIC-006)
7. Sprint 7: ナレッジベース (EPIC-005) ※Could Have

---

**This document was created using BMAD Method v6 - Phase 3 (Solutioning)**

*To continue: Run `/workflow-status` to see your progress and next recommended workflow.*

---

## Appendix A: Technology Evaluation Matrix

| カテゴリ | 選択肢 | コスト | 機能 | 学習コスト | 選定 |
|---------|--------|--------|------|-----------|------|
| **フレームワーク** | Next.js | 無料 | SSR+SSG+API | 中 | **採用** |
| | Remix | 無料 | SSR+API | 中 | 見送り（Vercel統合でNext.jsが優位） |
| | SvelteKit | 無料 | SSR+API | 低 | 見送り（エコシステムの成熟度） |
| **DB** | Supabase | 無料 | PG+Auth+RLS | 低 | **採用** |
| | PlanetScale | 無料 | MySQL | 低 | 見送り（Auth別途必要） |
| | Neon | 無料 | PG | 低 | 見送り（Auth別途必要） |
| **ホスティング** | Vercel | 無料 | Edge+CDN | 低 | **採用** |
| | Cloudflare Pages | 無料 | Edge+CDN | 中 | 見送り（Next.js完全互換性の懸念） |
| | Netlify | 無料 | CDN | 低 | 見送り（Next.js SSR対応が限定的） |
| **LLM** | Gemini Flash-Lite | 無料 | 高速生成 | 低 | **採用** |
| | Claude API (Haiku) | 有料 | 高品質 | 低 | 見送り（無料枠なし） |
| | OpenRouter | 一部無料 | マルチモデル | 低 | フォールバック候補 |

---

## Appendix B: Capacity Planning

| メトリクス | 想定値（月4ラウンド） | 無料枠上限 | 使用率 |
|-----------|---------------------|-----------|--------|
| Gemini API呼び出し | ~120回/月 | 30,000回/月 | 0.4% |
| DB容量 | ~50KB/月増加 | 500MB | 年間0.1% |
| Vercel帯域 | ~1GB/月 | 100GB/月 | 1% |
| Vercel Function実行 | ~500回/月 | ~100万回/月 | 0.05% |
| Supabase MAU | 1-10人 | 50,000人 | 0.02% |

**結論:** 全メトリクスで無料枠の1%未満。大幅な余裕あり。

---

## Appendix C: Cost Estimation

### 現在の想定（月4ラウンド、1-10ユーザー）

| 項目 | 月額 |
|------|------|
| Vercel Free | ¥0 |
| Supabase Free | ¥0 |
| Gemini API Free | ¥0 |
| 楽天GORA API | ¥0 |
| ドメイン（任意） | ~¥100/月 |
| **合計** | **¥0（ドメインなし）** |

### 成長時の想定（月20ラウンド、50ユーザー）

| 項目 | 月額 |
|------|------|
| Vercel Free | ¥0 |
| Supabase Free | ¥0 |
| Gemini API Free | ¥0（無料枠内） |
| **合計** | **¥0** |

### 大規模時の想定（月200ラウンド、500ユーザー）

| 項目 | 月額 |
|------|------|
| Vercel Pro | ~$20（約¥3,000） |
| Supabase Pro | $25（約¥3,750） |
| Gemini API | ~$1（約¥150） |
| **合計** | **約¥6,900/月** |
