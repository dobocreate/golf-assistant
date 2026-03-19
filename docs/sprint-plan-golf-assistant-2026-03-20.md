# Sprint Plan: Golf Assistant

**Date:** 2026-03-20
**Scrum Master:** kishida
**Project Level:** Level 3
**Total Stories:** 20（MVP: 16 / Post-MVP: 4）
**Total Points:** 79（MVP: 62）
**Planned Sprints:** 5（MVP: 4 / Post-MVP: 1）
**Sprint Length:** 1週間（最速MVP方針）

---

## Executive Summary

最速でMVPを構築するため、1週間スプリントを採用する。Must Have機能に集中し、4スプリント（4週間）でMVPリリースを目指す。Should Have/Could Have機能はMVP後に追加する。

**Key Metrics:**

| 項目 | 値 |
|------|-----|
| MVP Stories | 16 |
| MVP Points | 62 |
| MVP Sprints | 4（4週間） |
| Post-MVP Stories | 4 |
| Post-MVP Points | 17 |
| Definition of Done | 動作する機能 + 基本テスト |

**MVP方針:**
- Must Have FRのみに集中
- テストは主要パスのみ（カバレッジ目標は下げる）
- UIはシンプルで機能的（見た目は後から改善）
- Should Have（FR-002, FR-003, FR-007, FR-011, FR-015）はPost-MVP
- Could Have（FR-012, FR-013）はPost-MVP以降

---

## Story Inventory

### Sprint 0: プロジェクトセットアップ

---

### STORY-001: プロジェクト初期セットアップ

**Epic:** インフラ（EPIC横断）
**Priority:** Must Have

**User Story:**
As a 開発者
I want to 開発環境を構築したい
So that 開発を開始できる

**Acceptance Criteria:**
- [ ] Next.js 15 プロジェクトが作成されている（App Router, TypeScript, Tailwind CSS）
- [ ] Supabase プロジェクトが作成され、接続できる
- [ ] Supabase Auth が設定されている
- [ ] 全テーブルのマイグレーションが作成されている（RLS含む）
- [ ] Vercel にデプロイされ、アクセス可能
- [ ] 環境変数（Gemini API Key, 楽天GORA App ID）が設定されている
- [ ] pnpm, ESLint, Prettier が設定されている

**Technical Notes:**
- アーキテクチャ文書の DB スキーマをそのままマイグレーションに使用
- Supabase CLIでローカル開発環境も構築
- Vercel GitHub連携で自動デプロイ設定

**Story Points:** 5

---

### STORY-002: 認証（サインアップ・ログイン・ログアウト）

**Epic:** EPIC-001 ユーザー基盤
**Priority:** Must Have

**User Story:**
As a ゴルファー
I want to アカウントを作成してログインしたい
So that 自分のデータを安全に管理できる

**Acceptance Criteria:**
- [ ] メールアドレスとパスワードでサインアップできる
- [ ] ログイン・ログアウトができる
- [ ] パスワードリセットメールが送信される
- [ ] 未認証ユーザーは `/auth` にリダイレクトされる
- [ ] 認証後はダッシュボード（`/`）に遷移する

**Technical Notes:**
- Supabase Auth + `@supabase/ssr`
- Next.js Middleware で認証チェック
- シンプルなフォームUI（Tailwind）

**Dependencies:** STORY-001

**Story Points:** 5

---

### STORY-003: 共通レイアウト（PC/モバイル切り替え）

**Epic:** EPIC-001 ユーザー基盤
**Priority:** Must Have

**User Story:**
As a ゴルファー
I want to PCでもスマホでも快適に使いたい
So that プレー中はスマホ、準備や振り返りはPCで使える

**Acceptance Criteria:**
- [ ] PCレイアウト：サイドバーナビゲーション付き
- [ ] モバイルレイアウト（`/play`配下）：ボトムナビ＋大きなボタンUI
- [ ] レスポンシブブレイクポイントが正しく動作する
- [ ] 高コントラスト配色で屋外でも見やすい
- [ ] フォントサイズ16px以上、タッチターゲット48px以上

**Technical Notes:**
- `(main)/layout.tsx`: PC用ナビレイアウト
- `play/layout.tsx`: モバイル最適化レイアウト
- Tailwind `sm:`, `md:`, `lg:` でレスポンシブ対応

**Dependencies:** STORY-001

**Story Points:** 5

---

### Sprint 1: ユーザー基盤 + コース情報

---

### STORY-004: ユーザープロファイル管理

**Epic:** EPIC-001 ユーザー基盤
**Priority:** Must Have

**User Story:**
As a ゴルファー
I want to 自分のゴルフ特性（飛距離、苦手クラブ、ミス傾向）を登録したい
So that AIが正確なアドバイスをくれる

**Acceptance Criteria:**
- [ ] プロファイル編集画面（`/profile`）が表示される
- [ ] ハンディキャップ、プレースタイル、ミス傾向、疲労時の傾向を入力できる
- [ ] クラブ一覧を登録できる（クラブ名、飛距離、苦手フラグ、自信度）
- [ ] プロファイル・クラブ情報が保存・更新される
- [ ] クラブはプリセット（1W, 3W, 5W, 3I〜9I, PW, AW, SW, PT）から選択 + カスタム追加

**Technical Notes:**
- `profiles` テーブル + `clubs` テーブルへの CRUD
- Server Actions（`actions/profile.ts`）
- フォームは React Server Actions で送信

**Dependencies:** STORY-002

**Story Points:** 5

---

### STORY-005: 楽天GORA APIコース検索・保存

**Epic:** EPIC-002 コース情報管理
**Priority:** Must Have

**User Story:**
As a ゴルファー
I want to コース名でゴルフ場を検索して情報を取得したい
So that ラウンド前にコース情報を準備できる

**Acceptance Criteria:**
- [ ] コース検索画面（`/courses`）でキーワード検索ができる
- [ ] 検索結果にゴルフ場名、所在地が表示される
- [ ] コースを選択すると詳細情報が取得・保存される
- [ ] コースレイアウト画像が表示される
- [ ] 保存済みコースの一覧が表示される

**Technical Notes:**
- API Route: `GET /api/courses/search?q=xxx`（楽天GORA APIプロキシ）
- `courses` テーブルにキャッシュ保存
- APIキーはサーバーサイドのみ

**Dependencies:** STORY-001

**Story Points:** 5

---

### STORY-006: ホール情報・メモ管理

**Epic:** EPIC-002 コース情報管理
**Priority:** Must Have

**User Story:**
As a ゴルファー
I want to 各ホールの情報と攻略メモを管理したい
So that ラウンド中にすぐ参照できる

**Acceptance Criteria:**
- [ ] コース詳細画面（`/courses/[id]`）で全18ホールの情報が表示される
- [ ] 各ホールのPar、距離、特徴が表示される
- [ ] 各ホールにメモ（攻略法、注意点）を追加・編集できる
- [ ] ホール情報は手動入力で補完できる（GORA APIでは不足する場合）

**Technical Notes:**
- `holes` テーブル + `hole_notes` テーブル
- 楽天GORA APIから取得できるデータは自動入力、不足分は手動
- Server Actions（`actions/course.ts`）

**Dependencies:** STORY-005

**Story Points:** 3

---

### Sprint 2: スコア記録 + 音声機能

---

### STORY-007: ラウンド開始・コース選択

**Epic:** EPIC-004 スコア・ショット記録
**Priority:** Must Have

**User Story:**
As a ゴルファー
I want to ラウンドを開始してコースを選択したい
So that スコア記録とAIアドバイスの準備ができる

**Acceptance Criteria:**
- [ ] プレー開始画面（`/play`）で保存済みコースを選択できる
- [ ] ラウンド開始ボタンでラウンドが作成される
- [ ] コンテキストスナップショットが自動構築・保存される
- [ ] プレー画面（`/play/[roundId]`）に遷移する

**Technical Notes:**
- `rounds` テーブルに新規レコード作成
- `context-builder.ts` でプロファイル + コース + ナレッジを集約
- `rounds.context_snapshot` にJSON保存

**Dependencies:** STORY-004, STORY-006

**Story Points:** 5

---

### STORY-008: ホール別スコア入力UI（モバイル最適化）

**Epic:** EPIC-004 スコア・ショット記録
**Priority:** Must Have

**User Story:**
As a ゴルファー
I want to ボタン2タップ以内でスコアを記録したい
So that プレーの流れを止めずに記録できる

**Acceptance Criteria:**
- [ ] 現在のホール番号・Par・距離が大きく表示される
- [ ] 打数をボタンで入力できる（Par-2〜Par+4の範囲ボタン）
- [ ] パット数をボタンで入力できる（0〜4）
- [ ] フェアウェイキープ（Yes/No）をボタンで記録
- [ ] パーオン（Yes/No）をボタンで記録
- [ ] 次ホール/前ホールに移動できる
- [ ] すべてのボタンは片手操作可能なサイズ（48px以上）

**Technical Notes:**
- `/play/[roundId]/page.tsx` のメインUI
- `scores` テーブルへの即時保存（Server Action）
- 楽観的UI更新 + localStorage バッファ
- 大きなボタンUI（Tailwind `min-h-12 min-w-12 text-lg`）

**Dependencies:** STORY-007

**Story Points:** 5

---

### STORY-009: 音声入力による反省メモ

**Epic:** EPIC-004 スコア・ショット記録
**Priority:** Must Have

**User Story:**
As a ゴルファー
I want to 音声でメモを記録したい
So that 文字入力の時間がなくても気づきを残せる

**Acceptance Criteria:**
- [ ] マイクボタンをタップすると音声認識が開始される
- [ ] 日本語の音声がテキストに変換される
- [ ] 認識結果が表示され、保存ボタンで確定する
- [ ] 各ホールにメモが紐付けられる
- [ ] PC画面でメモの確認・編集ができる

**Technical Notes:**
- `hooks/use-speech-recognition.ts`（Web Speech Recognition API）
- `recognition.lang = 'ja-JP'`
- `memos` テーブルに保存

**Dependencies:** STORY-008

**Story Points:** 3

---

### STORY-010: 音声読み上げ

**Epic:** EPIC-003 AIキャディー
**Priority:** Must Have

**User Story:**
As a ゴルファー
I want to アドバイスを音声で聞きたい
So that スマホ画面を見続けなくてもよい

**Acceptance Criteria:**
- [ ] アドバイス表示エリアにスピーカーボタンがある
- [ ] タップすると日本語でアドバイスが読み上げられる
- [ ] 読み上げ中に再度タップすると停止する

**Technical Notes:**
- `hooks/use-speech-synthesis.ts`（Web Speech Synthesis API）
- 日本語音声を自動選択
- AIアドバイスが表示された後に呼び出し可能

**Dependencies:** STORY-001

**Story Points:** 2

---

### STORY-011: ラウンド完了・スコア集計

**Epic:** EPIC-004 スコア・ショット記録
**Priority:** Must Have

**User Story:**
As a ゴルファー
I want to ラウンドを完了してスコアを確認したい
So that 結果を振り返れる

**Acceptance Criteria:**
- [ ] ラウンド完了ボタンで `rounds.status` が `completed` に更新される
- [ ] 合計スコアが自動計算・保存される
- [ ] ラウンド振り返り画面（`/rounds/[id]`）に遷移する
- [ ] 未入力ホールがある場合は警告表示

**Dependencies:** STORY-008

**Story Points:** 2

---

### Sprint 3: AIキャディー

---

### STORY-012: コンテキストビルダー

**Epic:** EPIC-003 AIキャディー
**Priority:** Must Have

**User Story:**
As a システム
I want to プレーヤー情報・コース情報・ナレッジを構造化したコンテキストを構築したい
So that AIが的確なアドバイスを生成できる

**Acceptance Criteria:**
- [ ] プロファイル（飛距離、ミス傾向等）がコンテキストに含まれる
- [ ] 当日コース全18ホールの情報がコンテキストに含まれる
- [ ] ホール別メモ（攻略法）がコンテキストに含まれる
- [ ] ナレッジベース（存在する場合）がコンテキストに含まれる
- [ ] 直近5ラウンドの傾向サマリーがコンテキストに含まれる
- [ ] コンテキスト全体が10,000トークン以内に収まる

**Technical Notes:**
- `lib/context-builder.ts`
- Supabaseから並列データ取得（`Promise.all`）
- コンテキストのトークン数を推定・制限するロジック
- `rounds.context_snapshot` にJSONとして保存

**Dependencies:** STORY-004, STORY-006

**Story Points:** 5

---

### STORY-013: Gemini APIアドバイス生成（ストリーミング）

**Epic:** EPIC-003 AIキャディー
**Priority:** Must Have

**User Story:**
As a ゴルファー
I want to 状況を入力するとAIがアドバイスをくれる
So that 疲れていても適切な判断ができる

**Acceptance Criteria:**
- [ ] Gemini API（Flash-Lite）にコンテキスト＋状況を送信できる
- [ ] レスポンスがストリーミングで段階的に表示される
- [ ] 推奨クラブ、戦略、注意点が構造化されて表示される
- [ ] レスポンスは5秒以内に表示開始される
- [ ] APIエラー時にフォールバックメッセージが表示される

**Technical Notes:**
- `lib/gemini.ts` + Vercel AI SDK（`@ai-sdk/google`）
- `streamText()` でストリーミングレスポンス
- API Route: `POST /api/advice/stream`
- OpenAI互換形式で実装（将来のプロバイダー切り替え用）
- レスポンスJSON: `{ club: string, strategy: string, notes: string[] }`

**Dependencies:** STORY-012

**Story Points:** 8

---

### STORY-014: プレー中状況入力UI

**Epic:** EPIC-003 AIキャディー
**Priority:** Must Have

**User Story:**
As a ゴルファー
I want to 現在の状況をボタンで素早く入力したい
So that 最小限の操作でAIアドバイスを受けられる

**Acceptance Criteria:**
- [ ] ショット種別ボタン（ティーショット / セカンド / アプローチ / パット）
- [ ] 残り距離の選択（ボタンで範囲選択: 〜100, 100〜150, 150〜200, 200+）
- [ ] ライ・状況タグ（フェアウェイ / ラフ / バンカー / 林 / 打ち下ろし / 打ち上げ）
- [ ] 「アドバイス」ボタンでAI呼び出し
- [ ] 全操作が2タップ以内
- [ ] アドバイス結果の表示エリア＋音声読み上げボタン

**Technical Notes:**
- プレー画面のメインUIに統合
- 状況選択 → Server Action → Gemini API → ストリーミング表示
- 音声読み上げ（STORY-010）と連携

**Dependencies:** STORY-013, STORY-010

**Story Points:** 5

---

### STORY-015: プレー中スコア状況のコンテキスト反映

**Epic:** EPIC-003 AIキャディー
**Priority:** Must Have

**User Story:**
As a ゴルファー
I want to 今日のスコア推移がAIアドバイスに反映されてほしい
So that 後半の崩れ防止など状況に応じたアドバイスがもらえる

**Acceptance Criteria:**
- [ ] 現在のスコア推移（各ホールの結果）がプロンプトに含まれる
- [ ] ホール進行（前半/後半）に応じた注意喚起がある
- [ ] 直近ホールのスコアが悪い場合、安全寄りのアドバイスになる

**Technical Notes:**
- `actions/advice.ts` で現在のスコアデータをプロンプトに追加
- コンテキストスナップショットは固定、スコア推移はリアルタイム取得
- システムプロンプトに疲労推定ルールを含める

**Dependencies:** STORY-013, STORY-008

**Story Points:** 3

---

### Sprint 4: 振り返り + 仕上げ

---

### STORY-016: ラウンド振り返り画面

**Epic:** EPIC-006 AI分析（ラウンド後）
**Priority:** Must Have

**User Story:**
As a ゴルファー
I want to ラウンド後にスコアとメモを一覧で確認したい
So that 振り返りとClaudeでの分析ができる

**Acceptance Criteria:**
- [ ] ラウンド詳細画面（`/rounds/[id]`）にホール別スコアが表示される
- [ ] 各ホールの反省メモが一覧表示される
- [ ] 基本統計が表示される（合計スコア、FWキープ率、パーオン率、平均パット数）
- [ ] スコアデータをテキスト形式でコピーできる（Claudeへの貼り付け用）

**Technical Notes:**
- Server Component でデータ取得＋SSR
- `recharts` でスコア推移グラフ
- コピーボタンで構造化テキストをクリップボードに

**Dependencies:** STORY-011

**Story Points:** 5

---

### STORY-017: ラウンド履歴一覧

**Epic:** EPIC-006 AI分析（ラウンド後）
**Priority:** Must Have

**User Story:**
As a ゴルファー
I want to 過去のラウンド一覧を見たい
So that 成績の推移を把握できる

**Acceptance Criteria:**
- [ ] ラウンド一覧画面（`/rounds`）に過去のラウンドが新しい順で表示される
- [ ] 各ラウンド: 日付、コース名、合計スコアが表示される
- [ ] ラウンドをタップすると詳細画面に遷移する

**Dependencies:** STORY-011

**Story Points:** 2

---

### STORY-018: ダッシュボード

**Epic:** EPIC-001 ユーザー基盤
**Priority:** Must Have

**User Story:**
As a ゴルファー
I want to トップページで次のアクションが分かるようにしたい
So that すぐにプレー開始や準備に取りかかれる

**Acceptance Criteria:**
- [ ] ダッシュボード（`/`）にクイックアクションが表示される（ラウンド開始、コース検索）
- [ ] 直近のラウンド結果サマリーが表示される
- [ ] プロファイル未設定の場合、設定を促すメッセージが表示される

**Dependencies:** STORY-002

**Story Points:** 3

---

### Post-MVP: Should Have / Could Have

---

### STORY-019: ショット結果詳細記録

**Epic:** EPIC-004 スコア・ショット記録
**Priority:** Should Have

**User Story:**
As a ゴルファー
I want to 各ショットの詳細（クラブ、結果、ミス種類）を記録したい
So that より詳細な傾向分析ができる

**Acceptance Criteria:**
- [ ] ショット結果を評価ボタン（◎○△✕）で記録できる
- [ ] ミスの種類をボタンで選択できる（フック、スライス、ダフリ、トップ等）
- [ ] 使用クラブをボタンで選択できる

**Dependencies:** STORY-008

**Story Points:** 5

---

### STORY-020: 疲労・メンタル考慮の高度化

**Epic:** EPIC-003 AIキャディー
**Priority:** Should Have

**User Story:**
As a ゴルファー
I want to OB後や連続ボギー後に切り替えアドバイスがほしい
So that メンタル面でも支えてもらえる

**Acceptance Criteria:**
- [ ] OBやダブルボギー後に切り替え促進メッセージが自動表示
- [ ] 連続ボギー検知でアドバイストーンが変化する
- [ ] ユーザーのミス傾向に基づく注意喚起が強化される

**Dependencies:** STORY-015

**Story Points:** 3

---

### STORY-021: ナレッジベースCRUD

**Epic:** EPIC-005 データアナリスト
**Priority:** Could Have

**User Story:**
As a ゴルファー
I want to ゴルフ知見をカテゴリ・タグ付きで管理したい
So that プレー中のAIアドバイスに活用できる

**Acceptance Criteria:**
- [ ] ナレッジ一覧画面（`/knowledge`）で知見の一覧が表示される
- [ ] 知見の追加・編集・削除ができる
- [ ] カテゴリ（スイング技術、コースマネジメント、メンタル、練習法）で分類
- [ ] タグ（バンカー、打ち下ろし、風等）で検索・フィルタ
- [ ] 出典URL（YouTube等）をリンク保存

**Dependencies:** STORY-001

**Story Points:** 5

---

### STORY-022: スコア統計・グラフ（詳細版）

**Epic:** EPIC-006 AI分析（ラウンド後）
**Priority:** Should Have

**User Story:**
As a ゴルファー
I want to 複数ラウンドにまたがるスコア傾向をグラフで見たい
So that 長期的な上達を確認できる

**Acceptance Criteria:**
- [ ] スコア推移グラフ（ラウンド単位）
- [ ] 前半/後半スコア比較
- [ ] Par3/4/5別の平均スコア
- [ ] FWキープ率、パーオン率の推移

**Dependencies:** STORY-017

**Story Points:** 4

---

## Sprint Allocation

### Sprint 0（Week 0）— 基盤構築 — 15pt

**Goal:** 開発環境構築＋認証＋レスポンシブレイアウトを完成させる

| Story | タイトル | Points | 優先度 |
|-------|---------|--------|--------|
| STORY-001 | プロジェクト初期セットアップ | 5 | Must |
| STORY-002 | 認証（サインアップ・ログイン） | 5 | Must |
| STORY-003 | 共通レイアウト（PC/モバイル） | 5 | Must |

**Committed:** 15 points
**Sprint完了条件:** Vercelにデプロイされ、ログインしてPC/モバイルレイアウトが表示される

---

### Sprint 1（Week 1）— ユーザー基盤 + コース情報 — 13pt

**Goal:** プロファイル登録とコース情報管理が使える状態にする

| Story | タイトル | Points | 優先度 |
|-------|---------|--------|--------|
| STORY-004 | ユーザープロファイル管理 | 5 | Must |
| STORY-005 | 楽天GORA APIコース検索・保存 | 5 | Must |
| STORY-006 | ホール情報・メモ管理 | 3 | Must |

**Committed:** 13 points
**Sprint完了条件:** プロファイル登録済み、コース検索・保存・ホールメモ追加ができる

---

### Sprint 2（Week 2）— スコア記録 + 音声 — 17pt

**Goal:** プレー中のスコア記録と音声機能が動作する

| Story | タイトル | Points | 優先度 |
|-------|---------|--------|--------|
| STORY-007 | ラウンド開始・コース選択 | 5 | Must |
| STORY-008 | ホール別スコア入力UI | 5 | Must |
| STORY-009 | 音声入力による反省メモ | 3 | Must |
| STORY-010 | 音声読み上げ | 2 | Must |
| STORY-011 | ラウンド完了・スコア集計 | 2 | Must |

**Committed:** 17 points
**Sprint完了条件:** ラウンド開始→スコア記録→音声メモ→ラウンド完了の一連の流れが動作する

---

### Sprint 3（Week 3）— AIキャディー — 21pt

**Goal:** AIアドバイス機能が動作し、プレー中に実用できる

| Story | タイトル | Points | 優先度 |
|-------|---------|--------|--------|
| STORY-012 | コンテキストビルダー | 5 | Must |
| STORY-013 | Gemini APIアドバイス生成 | 8 | Must |
| STORY-014 | プレー中状況入力UI | 5 | Must |
| STORY-015 | スコア状況のコンテキスト反映 | 3 | Must |

**Committed:** 21 points
**Sprint完了条件:** 状況を入力→AIがコンテキストに基づいたアドバイスを生成→音声読み上げが動作する

**リスク:** STORY-013（Gemini API統合）は最大の技術リスク。ストリーミング動作の検証を早めに行う

---

### Sprint 4（Week 4）— 振り返り + 仕上げ — MVP完成 — 10pt

**Goal:** ラウンド振り返り＋ダッシュボードを完成させ、MVP全体を仕上げる

| Story | タイトル | Points | 優先度 |
|-------|---------|--------|--------|
| STORY-016 | ラウンド振り返り画面 | 5 | Must |
| STORY-017 | ラウンド履歴一覧 | 2 | Must |
| STORY-018 | ダッシュボード | 3 | Must |

**Committed:** 10 points（バッファあり：バグ修正・UI調整に充当）
**Sprint完了条件:** 全画面が動作し、ラウンドの一連の流れ（準備→プレー→振り返り）が完結する

---

### Post-MVP Sprint（Week 5〜）— 機能拡充 — 17pt

**Goal:** Should Have / Could Have 機能を順次追加

| Story | タイトル | Points | 優先度 |
|-------|---------|--------|--------|
| STORY-019 | ショット結果詳細記録 | 5 | Should |
| STORY-020 | 疲労・メンタル考慮の高度化 | 3 | Should |
| STORY-021 | ナレッジベースCRUD | 5 | Could |
| STORY-022 | スコア統計・グラフ（詳細版） | 4 | Should |

---

## Epic Traceability

| Epic ID | Epic Name | Stories | Total Points | Sprint |
|---------|-----------|---------|--------------|--------|
| - | インフラ | STORY-001 | 5 | 0 |
| EPIC-001 | ユーザー基盤 | STORY-002, 003, 004, 018 | 18 | 0, 1, 4 |
| EPIC-002 | コース情報管理 | STORY-005, 006 | 8 | 1 |
| EPIC-004 | スコア・ショット記録 | STORY-007, 008, 009, 011, 019 | 20 | 2, Post |
| EPIC-003 | AIキャディー | STORY-010, 012, 013, 014, 015, 020 | 26 | 2, 3, Post |
| EPIC-006 | AI分析（ラウンド後） | STORY-016, 017, 022 | 11 | 4, Post |
| EPIC-005 | データアナリスト | STORY-021 | 5 | Post |

---

## Functional Requirements Coverage

| FR ID | FR Name | Story | Sprint | Priority |
|-------|---------|-------|--------|----------|
| FR-001 | ショット戦略アドバイス | STORY-013, 014 | 3 | Must |
| FR-002 | 状況別スイング注意点 | STORY-014（基本）, 021（ナレッジ連携） | 3, Post | Must/Could |
| FR-003 | 疲労・メンタル考慮 | STORY-015（基本）, 020（高度化） | 3, Post | Must/Should |
| FR-004 | 音声読み上げ | STORY-010 | 2 | Must |
| FR-005 | 音声入力 | STORY-009 | 2 | Must |
| FR-006 | ホール別スコア記録 | STORY-008 | 2 | Must |
| FR-007 | ショット結果記録 | STORY-019 | Post | Should |
| FR-008 | 反省・気づきメモ | STORY-009 | 2 | Must |
| FR-009 | ユーザープロファイル | STORY-004 | 1 | Must |
| FR-010 | コース情報管理 | STORY-005, 006 | 1 | Must |
| FR-011 | ラウンド前プレビュー | Claudeサブスク→ホールメモ | - | Should |
| FR-012 | YouTube動画分析 | Claudeサブスク→ナレッジ登録 | - | Could |
| FR-013 | ナレッジベース管理 | STORY-021 | Post | Could |
| FR-014 | ラウンド振り返り画面 | STORY-016 | 4 | Must |
| FR-015 | AI傾向分析 | Claudeサブスク + STORY-022 | Post | Should |
| FR-016 | ユーザー登録・認証 | STORY-002 | 0 | Must |
| FR-017 | マルチデバイス対応 | STORY-003 | 0 | Must |

---

## Risks and Mitigation

### High

| リスク | 影響 | 対策 |
|-------|------|------|
| Gemini API統合の技術的不確実性 | Sprint 3のブロッカー | Sprint 2中にプロトタイプ検証。APIキー取得を早期に |
| Web Speech APIのゴルフ用語認識精度 | 音声入力の実用性 | Sprint 2で早期検証。精度不足なら手動テキスト入力をフォールバック |

### Medium

| リスク | 影響 | 対策 |
|-------|------|------|
| 楽天GORA APIのホールデータ不足 | コース情報の精度 | 手動入力UIで補完 |
| Sprint 3のポイント過多（21pt） | スプリント遅延 | STORY-015をSprint 4にバッファとして移動可能 |

### Low

| リスク | 影響 | 対策 |
|-------|------|------|
| Vercel/Supabase無料枠変更 | コスト発生 | 代替サービスへの移行パスは確保済み |

---

## Dependencies

### External（Sprint 0で準備完了させる）

- [ ] Supabase アカウント作成 + プロジェクト作成
- [ ] Google AI Studio で Gemini API Key 取得
- [ ] 楽天ウェブサービス API アプリID取得
- [ ] Vercel アカウント + GitHub リポジトリ連携
- [ ] ドメイン（任意、後からでもOK）

---

## Definition of Done（MVP版）

For a story to be considered complete:
- [ ] 機能が動作する（Acceptance Criteria を満たす）
- [ ] TypeScript エラーがない
- [ ] 主要パスのテストが存在する
- [ ] Vercelにデプロイされ、動作確認済み
- [ ] レスポンシブ対応（PC + モバイル）

※ MVPフェーズでは、カバレッジ目標やコードレビューは省略し、動作する機能の完成を最優先する

---

## Sprint Timeline

```
Week 0: Sprint 0 — 基盤構築（環境 + 認証 + レイアウト）
Week 1: Sprint 1 — プロファイル + コース情報
Week 2: Sprint 2 — スコア記録 + 音声機能
Week 3: Sprint 3 — AIキャディー ★コア機能
Week 4: Sprint 4 — 振り返り + 仕上げ → MVP完成 🎉
Week 5+: Post-MVP — 機能拡充
```

---

## Next Steps

**Immediate:** Begin Sprint 0

Run `/dev-story STORY-001` to start with project setup, or implement stories sequentially.

**Sprint cadence (1-week sprint):**
- 月曜: Sprint開始
- 金曜: Sprint完了・次Sprint計画

---

**This plan was created using BMAD Method v6 - Phase 4 (Implementation Planning)**

*To continue: Run `/workflow-status` to see your progress and next recommended workflow.*
