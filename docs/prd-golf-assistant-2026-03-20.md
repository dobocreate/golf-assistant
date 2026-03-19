# Product Requirements Document: Golf Assistant

**Date:** 2026-03-20
**Author:** kishida
**Version:** 1.4
**Project Type:** Web Application (Responsive)
**Project Level:** Level 3
**Status:** Draft

---

## Document Overview

This Product Requirements Document (PRD) defines the functional and non-functional requirements for Golf Assistant. It serves as the source of truth for what will be built and provides traceability from requirements through implementation.

**Related Documents:**
- Product Brief: なし（本PRDにて初回定義）

---

## Executive Summary

Golf Assistant は、ゴルフプレー中にAIがキャディーの役割を担い、ユーザーの特性・疲労状態・コース状況に基づいた戦略的アドバイスを提供するWebアプリケーションである。

プレー中のスマートフォン操作を最小限に抑えるため、ボタン操作と音声入力/読み上げに対応する。また、YouTube動画からゴルフ知識を分析・蓄積するデータアナリスト機能を備え、プレー中のアドバイスに活用する。

### アーキテクチャ方針: コンテキスト事前構築型

本アプリの核心的な設計思想として、**プレー前にすべての情報をコンテキストとして事前構築**し、プレー中はそのコンテキストを含むプロンプトに状況を入力するだけでAIアドバイスを得られる構成を採用する。

- **プレー前（PC・ローカル）:** Claudeサブスクリプションを活用し、コース調査・YouTube動画分析・傾向分析を手動対話で実施。結果をアプリのデータベースに蓄積する。
- **プレー中（スマホ・オンライン）:** 蓄積済みデータ（プレーヤー特性、コース情報、ナレッジ、過去傾向）をシステムプロンプトとして事前構築。ユーザーは状況をボタン/音声で入力するだけで、Google Gemini API（Flash-Lite）がコンテキストに基づいたアドバイスを生成する。
- **プレー後（PC・ローカル）:** スコアデータや反省メモをClaudeサブスクリプションで分析し、次回に向けた改善点を蓄積する。

この構成により、**API課金はプレー中の最小限に抑え**、情報収集・分析はClaudeサブスクリプション（既存契約）で賄う。

---

## Product Goals

### Business Objectives

1. **判断力低下の補完:** 疲労時でも適切なクラブ選択・ショット戦略の判断を支援する
2. **パーソナライズされたアドバイス:** ユーザーの特性（苦手クラブ、ミス傾向、飛距離等）に基づく個別最適なアドバイスを提供する
3. **継続的な上達支援:** ラウンドデータの蓄積と分析により、長期的なスコア改善を促進する
4. **低コスト運用:** 運用コストを最小限に抑え、個人〜少人数で持続可能な運用を実現する

### Success Metrics

| 指標 | 目標 |
|------|------|
| プレー中のアドバイス利用率 | 80%以上のホールで参照される |
| スコア記録の継続率 | ラウンドの90%以上でスコア記録が完了する |
| ユーザー満足度 | アドバイスが「役立った」と感じる割合 70%以上 |
| ナレッジベース活用率 | YouTube分析した知見がプレー中アドバイスに月1回以上反映される |

---

## User Personas

### ペルソナ1: メインユーザー（kishida）

- **ゴルフ歴:** 中級者
- **課題:** 後半の疲労で判断力が低下し、スコアが崩れる
- **特徴:** 力むとフックが出る、打ち下ろしでフックしやすい
- **利用デバイス:** プレー中はスマートフォン、プレー前後はPC
- **期待:** プロのキャディーが横にいる感覚

### ペルソナ2: 仲間ゴルファー

- **ゴルフ歴:** 初級〜中級
- **課題:** コースマネジメントの知識不足
- **期待:** 簡単に使えるAIアドバイス、スコア管理

---

## Functional Requirements

Functional Requirements (FRs) define **what** the system does - specific features and behaviors.

---

### 領域A: AIキャディー（プレー中アドバイス）

### FR-001: ショット戦略アドバイス表示

**Priority:** Must Have

**Description:**
各ショット前に、ユーザーの特性・コース状況・現在のスコア状況を考慮した戦略アドバイスを表示する。推奨クラブ、狙い方向、注意点を含む。

**Acceptance Criteria:**
- [ ] 現在のホール情報（距離、レイアウト）に基づくアドバイスが表示される
- [ ] ユーザープロファイル（苦手クラブ、ミス傾向）が考慮されている
- [ ] 推奨クラブ名、狙い方向、一言アドバイスが表示される
- [ ] 2タップ以内でアドバイス画面にアクセスできる

**Dependencies:** FR-009, FR-010

---

### FR-002: 状況別スイング注意点の提示

**Priority:** Must Have

**Description:**
バンカー、打ち下ろし、打ち上げ、ラフ等の状況に応じて、ナレッジベースから関連するスイング技術の注意点を表示する。

**Acceptance Criteria:**
- [ ] 状況をボタンで選択できる（バンカー、打ち下ろし、打ち上げ、ラフ、林等）
- [ ] 選択した状況に対応するスイング注意点が表示される
- [ ] ナレッジベースに登録済みの知見が優先的に引用される
- [ ] 知見がない状況でもAIが一般的なアドバイスを生成する

**Dependencies:** FR-012

---

### FR-003: 疲労・メンタル考慮アドバイス

**Priority:** Should Have

**Description:**
ラウンド後半（特に14ホール目以降）や、連続ボギー・OB後などの状況で、疲労・メンタルを考慮したアドバイスを自動的に調整する。

**Acceptance Criteria:**
- [ ] ホール進行に応じて「疲労度」を推定する
- [ ] 疲労度が高い場合、より安全なクラブ選択・戦略を提案する
- [ ] OBやダブルボギー後に切り替え促進のメッセージを表示する
- [ ] ユーザーのミス傾向（例：力むとフック）に基づく注意喚起を行う

**Dependencies:** FR-001, FR-006

---

### FR-004: 音声読み上げ

**Priority:** Must Have

**Description:**
アドバイス内容を音声で読み上げる機能を提供する。プレー中にスマートフォン画面を見続けなくても情報を受け取れるようにする。

**Acceptance Criteria:**
- [ ] アドバイス表示時にワンタップで音声読み上げが開始される
- [ ] 読み上げ速度が調整可能
- [ ] 日本語の音声読み上げに対応している

---

### FR-005: 音声入力

**Priority:** Must Have

**Description:**
ショット後の反省・気づきメモを音声で入力できるようにする。プレー中のテキスト入力を不要にする。

**Acceptance Criteria:**
- [ ] マイクボタンをタップして音声入力が開始される
- [ ] 日本語の音声認識に対応している
- [ ] 認識結果がテキストとして保存される
- [ ] 認識結果の修正が可能（プレー後にPC等で）

---

### 領域B: スコア・ショット記録

### FR-006: ホール別スコア記録

**Priority:** Must Have

**Description:**
各ホールのスコアをボタン操作で簡単に記録する。パット数、フェアウェイキープ、パーオン等の基本統計も記録する。

**Acceptance Criteria:**
- [ ] 各ホールのスコア（打数）をボタンで入力できる
- [ ] パット数をボタンで入力できる
- [ ] フェアウェイキープ（Yes/No）をボタンで記録できる
- [ ] パーオン（Yes/No）をボタンで記録できる
- [ ] 入力は各項目2タップ以内で完了する

---

### FR-007: ショット結果記録

**Priority:** Should Have

**Description:**
各ショットの結果（良い/普通/ミス等）をボタンで記録し、ミスの種類（フック、スライス、ダフリ等）も選択できる。

**Acceptance Criteria:**
- [ ] ショット結果を評価ボタン（◎○△✕）で記録できる
- [ ] ミスの種類をボタンで選択できる（フック、スライス、ダフリ、トップ等）
- [ ] 使用クラブをボタンで選択できる
- [ ] 各ショットにタイムスタンプが付与される

**Dependencies:** FR-006

---

### FR-008: 反省・気づきメモ

**Priority:** Must Have

**Description:**
各ホールまたはショット後に、反省や気づきをメモとして記録する。音声入力を主な入力手段とする。

**Acceptance Criteria:**
- [ ] 各ホールに対してメモを追加できる
- [ ] 音声入力でメモを記録できる（FR-005連携）
- [ ] メモはラウンド後にPC画面で確認・編集できる
- [ ] メモの内容がAI分析の入力データとして活用される

**Dependencies:** FR-005

---

### 領域C: ユーザープロファイル・コース管理

### FR-009: ユーザープロファイル管理

**Priority:** Must Have

**Description:**
ユーザーのゴルフ特性を登録・管理する。AIキャディーのアドバイス生成の基盤データとなる。

**Acceptance Criteria:**
- [ ] クラブ別飛距離を登録できる
- [ ] 苦手クラブを設定できる
- [ ] ミス傾向を登録できる（例：力むとフック、打ち下ろしでフック）
- [ ] 得意なショット・距離帯を登録できる
- [ ] 状況別の傾向を自由記述で追加できる
- [ ] プロファイルはいつでも編集可能

---

### FR-010: コース情報管理

**Priority:** Must Have

**Description:**
ラウンド予定のゴルフ場情報を楽天GORA API連携で取得し、追加メモと合わせて管理する。

**Acceptance Criteria:**
- [ ] コース名でゴルフ場を検索できる（楽天GORA API連携）
- [ ] コースの基本情報（ホール数、パー、距離等）が自動取得される
- [ ] コースレイアウト画像が表示される
- [ ] ホール別にユーザーメモ（注意点、攻略法等）を追加できる
- [ ] 過去にプレーしたコース情報が保存される

---

### FR-011: ラウンド前コースプレビュー

**Priority:** Should Have

**Description:**
ラウンド前に、AIがコース情報とユーザー特性を踏まえた事前アドバイスを生成する。

**Acceptance Criteria:**
- [ ] ラウンド予定のコースを選択すると、ホール別の注意点が表示される
- [ ] ユーザーの苦手な状況（打ち下ろし等）があるホールをハイライトする
- [ ] 全体的な戦略（攻めるホール、守るホール）を提案する

**Dependencies:** FR-009, FR-010

---

### 領域D: データアナリスト（YouTube分析・ナレッジベース）

### FR-012: YouTube動画分析

**Priority:** Could Have

**Description:**
ユーザーが指定したYouTube動画（プロの解説、コースマネジメント講座等）を分析し、ゴルフ知識を構造化して抽出する。

**Acceptance Criteria:**
- [ ] YouTube URLを入力すると動画内容が分析される
- [ ] 動画から抽出された知見がカテゴリ別に整理される
- [ ] カテゴリ例：状況別スイング技術、コースマネジメント、メンタル、練習法
- [ ] 抽出結果をユーザーが確認・編集できる

---

### FR-013: ナレッジベース管理

**Priority:** Could Have

**Description:**
YouTube分析で抽出した知見や、ユーザーが手動で追加した知識を、検索・参照可能なナレッジベースとして管理する。

**Acceptance Criteria:**
- [ ] 知見がカテゴリ・タグで分類される
- [ ] 状況タグ（バンカー、打ち下ろし、風、雨等）で検索できる
- [ ] 知見の出典（YouTube URL）がリンクされる
- [ ] ユーザーが手動で知見を追加・編集・削除できる
- [ ] ナレッジがAIアドバイス生成時に参照される（FR-001, FR-002連携）

**Dependencies:** FR-012

---

### 領域E: AI分析（ラウンド後）

### FR-014: ラウンド振り返り画面

**Priority:** Must Have

**Description:**
ラウンド後にスコア、ショット記録、反省メモを一覧で確認できる画面を提供する。PC画面での詳細確認を想定。

**Acceptance Criteria:**
- [ ] ホール別スコア一覧が表示される
- [ ] 各ホールの反省・気づきメモが確認できる
- [ ] ショット結果の統計（FW キープ率、パーオン率、平均パット数等）が表示される
- [ ] 過去のラウンド履歴を一覧表示できる

---

### FR-015: AI傾向分析

**Priority:** Should Have

**Description:**
蓄積されたラウンドデータを基に、AIがスコア傾向やミスパターンを分析し、改善提案を行う。

**Acceptance Criteria:**
- [ ] 前半/後半のスコア比較を分析する
- [ ] ホール種別（Par3/4/5）ごとの成績傾向を分析する
- [ ] よくあるミスパターンを特定する
- [ ] 具体的な改善提案を表示する（例：「後半のクラブ選択を1番手上げてみましょう」）
- [ ] 複数ラウンドにまたがるトレンド分析ができる

**Dependencies:** FR-006, FR-007

---

### 領域F: ユーザー管理

### FR-016: ユーザー登録・認証

**Priority:** Must Have

**Description:**
ユーザーアカウントの登録・ログイン機能を提供する。

**Acceptance Criteria:**
- [ ] メールアドレスとパスワードで新規登録できる
- [ ] ログイン・ログアウトができる
- [ ] パスワードリセットができる

---

### FR-017: マルチデバイス対応

**Priority:** Must Have

**Description:**
スマートフォン（プレー中）とPC（プレー前後）でシームレスに利用できるレスポンシブ対応。

**Acceptance Criteria:**
- [ ] スマートフォン画面でプレー中の操作が快適に行える
- [ ] PC画面でデータ入力・分析確認が快適に行える
- [ ] 同一アカウントで複数デバイスからアクセスできる
- [ ] データがリアルタイムで同期される

---

## Non-Functional Requirements

Non-Functional Requirements (NFRs) define **how** the system performs - quality attributes and constraints.

---

### NFR-001: Performance - レスポンス時間

**Priority:** Must Have

**Description:**
プレー中の操作はストレスなく即座に反応する必要がある。AIアドバイス生成は数秒以内に完了すること。

**Acceptance Criteria:**
- [ ] ボタン操作に対するUIレスポンスは200ms以内
- [ ] AIアドバイス生成は5秒以内に表示される
- [ ] スコア記録の保存は1秒以内に完了する

**Rationale:**
プレー中は同伴者を待たせるため、素早い操作が求められる。

---

### NFR-002: Usability - プレー中の操作性

**Priority:** Must Have

**Description:**
プレー中は片手操作・最小タップ数での操作を前提とする。日差しの下でも画面が見やすいこと。

**Acceptance Criteria:**
- [ ] 主要操作は2タップ以内で完了する
- [ ] ボタンは片手操作可能なサイズ（最小44px）
- [ ] 高コントラストな配色で屋外でも視認性が高い
- [ ] フォントサイズは16px以上

**Rationale:**
ゴルフ場でのプレー中操作であり、テキスト入力は困難。

---

### NFR-003: Security - データ保護

**Priority:** Must Have

**Description:**
ユーザーの個人情報とゴルフデータを適切に保護する。

**Acceptance Criteria:**
- [ ] パスワードはハッシュ化して保存する
- [ ] HTTPS通信を使用する
- [ ] ユーザーは自身のデータのみアクセス可能

**Rationale:**
個人の行動データ（位置情報含む）を扱うため。

---

### NFR-004: Scalability - ユーザー数対応

**Priority:** Should Have

**Description:**
初期は少数ユーザーだが、仲間への展開を見据えた設計とする。

**Acceptance Criteria:**
- [ ] 同時接続100ユーザーまで対応できる設計
- [ ] ユーザー数増加時にスケールアウト可能なアーキテクチャ

**Rationale:**
仲間への展開を想定。

---

### NFR-005: Reliability - データ永続性

**Priority:** Must Have

**Description:**
ラウンド中に入力したスコアやメモが失われないこと。

**Acceptance Criteria:**
- [ ] 入力データは即座にサーバーに保存される
- [ ] ネットワーク一時切断時もデータが失われない（ローカルバッファ）
- [ ] データの定期バックアップが実施される

**Rationale:**
プレー中に入力したデータは再入力が困難。

---

### NFR-006: Compatibility - ブラウザ・デバイス対応

**Priority:** Must Have

**Description:**
主要なスマートフォンブラウザとPCブラウザで動作すること。

**Acceptance Criteria:**
- [ ] iOS Safari、Android Chrome で動作する
- [ ] PC Chrome、Edge で動作する
- [ ] iPhone SE サイズ以上のスマートフォンに対応

**Rationale:**
特定のアプリストア審査なしで配布するため、Webアプリとする。

---

### NFR-007: Maintainability - コード品質

**Priority:** Should Have

**Description:**
個人開発から始まるが、将来の機能追加・保守を考慮した構成とする。

**Acceptance Criteria:**
- [ ] 主要機能のテストカバレッジ60%以上
- [ ] コンポーネント単位での分離設計
- [ ] APIドキュメントの整備

**Rationale:**
長期的に使い続けるアプリケーションのため。

---

### NFR-008: Cost - 運用コスト最小化

**Priority:** Must Have

**Description:**
個人〜少人数での運用を前提とし、月額の運用コストを最小限に抑える。ハイブリッド構成（ローカル＋オンライン）を採用し、APIコストが発生するのはプレー中のリアルタイムアドバイスのみとする。

**LLM API方針: Google Gemini API（直接利用）**

プレー中のAIアドバイス生成には **Google Gemini API（Flash-Lite）** を採用する。

| 選定理由 | 詳細 |
|---------|------|
| 無料枠 | Flash-Lite: 1,000リクエスト/日（開発〜小規模運用まで無料） |
| コスト | 有料でも1ラウンド（30回呼び出し）あたり約5円 |
| レスポンス | 直接接続で高速（TTFT約0.3秒、5秒要件を余裕でクリア） |
| 日本語品質 | 定型的なアドバイス生成に十分な品質 |
| 移行容易性 | OpenAI互換API形式で実装し、将来OpenRouter等への切り替えも可能にする |

**運用構成（コンテキスト事前構築型）:**

| 利用場面 | 実行環境 | AI利用方法 | コスト |
|---------|---------|-----------|--------|
| プレー前: コース調査・分析 | ローカル（PC） | Claudeサブスク（手動対話） | サブスク内 |
| プレー前: コンテキスト構築 | ローカル（PC） | アプリがデータを自動集約 | ¥0 |
| プレー中: AIアドバイス | オンライン（スマホ） | Gemini API Flash-Lite（事前構築コンテキスト＋状況入力） | 無料枠内 or 約5円/ラウンド |
| プレー中: スコア記録 | オンライン（スマホ） | APIなし（データ保存のみ） | ¥0 |
| プレー後: 振り返り・分析 | ローカル（PC） | Claudeサブスク（手動対話） | サブスク内 |
| YouTube分析 | ローカル（PC） | Claudeサブスク（手動対話） | サブスク内 |

**月間コスト見積もり（月4ラウンド想定）:**

| 項目 | コスト |
|------|--------|
| Gemini API（Flash-Lite無料枠内） | ¥0 |
| Gemini API（有料の場合） | 約20円/月 |
| ホスティング（無料枠） | ¥0 |
| 楽天GORA API | ¥0 |
| Claudeサブスク | 既存契約 |
| **合計** | **¥0〜20円/月** |

**Acceptance Criteria:**
- [ ] プレー前後・分析機能はローカル環境（localhost）で動作する
- [ ] プレー中のみオンラインサーバーが必要な設計とする
- [ ] オンラインサーバーのホスティングは無料枠または月額1,000円以内
- [ ] プレー中のLLM APIはGoogle Gemini API（Flash-Lite）を使用する
- [ ] LLM API呼び出しはOpenAI互換形式で実装し、プロバイダー切り替えを容易にする
- [ ] プレー中のコンテキスト（システムプロンプト）はプレーヤー特性・コース情報・ナレッジを含み、事前に構築済みであること
- [ ] Gemini API無料枠（1,000リクエスト/日）内での運用を基本とする
- [ ] 外部API（楽天GORA等）は無料枠内で運用可能
- [ ] ローカル環境のデータとオンライン環境のデータが同期できる

**Rationale:**
Google Gemini API Flash-Liteは無料枠が1,000リクエスト/日と大きく、月4ラウンド程度であれば完全無料で運用可能。有料に移行しても1ラウンド約5円と極めて低コスト。OpenAI互換形式で実装することで、将来OpenRouterや他プロバイダーへの移行も容易に行える。

---

## Epics

Epics are logical groupings of related functionality that will be broken down into user stories during sprint planning (Phase 4).

---

### EPIC-001: ユーザー基盤

**Description:**
ユーザー登録・認証、プロファイル管理、マルチデバイス対応など、アプリケーションの基盤機能。

**Functional Requirements:**
- FR-009: ユーザープロファイル管理
- FR-016: ユーザー登録・認証
- FR-017: マルチデバイス対応

**Story Count Estimate:** 5-7

**Priority:** Must Have

**Business Value:**
全機能の基盤。パーソナライズされたアドバイスの前提となるデータ管理。

---

### EPIC-002: コース情報管理

**Description:**
楽天GORA API連携によるゴルフ場検索、コース情報の取得・管理、ラウンド前プレビュー。

**Functional Requirements:**
- FR-010: コース情報管理
- FR-011: ラウンド前コースプレビュー

**Story Count Estimate:** 4-6

**Priority:** Must Have

**Business Value:**
AIアドバイスの精度を左右するコースデータの基盤。事前準備でラウンドの質を向上。

---

### EPIC-003: AIキャディー（プレー中アドバイス）

**Description:**
プレー中のAIアドバイス表示、状況別注意点、疲労考慮、音声読み上げなど、コアとなるキャディー機能。

**Functional Requirements:**
- FR-001: ショット戦略アドバイス表示
- FR-002: 状況別スイング注意点の提示
- FR-003: 疲労・メンタル考慮アドバイス
- FR-004: 音声読み上げ

**Story Count Estimate:** 6-10

**Priority:** Must Have

**Business Value:**
アプリの核心機能。疲労時の判断力低下を補い、スコア改善に直結。

---

### EPIC-004: スコア・ショット記録

**Description:**
プレー中のスコア記録、ショット結果記録、反省メモなど、ラウンドデータの入力機能。

**Functional Requirements:**
- FR-005: 音声入力
- FR-006: ホール別スコア記録
- FR-007: ショット結果記録
- FR-008: 反省・気づきメモ

**Story Count Estimate:** 5-8

**Priority:** Must Have

**Business Value:**
ラウンドデータの蓄積基盤。AI分析とアドバイス精度向上の原資。

---

### EPIC-005: データアナリスト（YouTube分析・ナレッジベース）

**Description:**
YouTube動画の分析による知見抽出、ナレッジベースの構築・管理。AIキャディーへの知見提供。

**Functional Requirements:**
- FR-012: YouTube動画分析
- FR-013: ナレッジベース管理

**Story Count Estimate:** 4-6

**Priority:** Could Have（最後に実装）

**Implementation Order:** 6/6（全エピック中最後）

**Business Value:**
プロの知見をパーソナライズされたアドバイスに変換。継続的な学習・上達を支援。ただしAIキャディーの基本機能が安定稼働してからの追加機能とする。

---

### EPIC-006: AI分析（ラウンド後）

**Description:**
ラウンド後の振り返り画面、AI傾向分析、改善提案。PC画面での詳細確認を想定。

**Functional Requirements:**
- FR-014: ラウンド振り返り画面
- FR-015: AI傾向分析

**Story Count Estimate:** 4-6

**Priority:** Should Have

**Business Value:**
蓄積データの分析による長期的なスコア改善。モチベーション維持。

---

## User Stories (High-Level)

User stories follow the format: "As a [user type], I want [goal] so that [benefit]."

### EPIC-001: ユーザー基盤
- ゴルファーとして、自分のクラブ別飛距離やミス傾向を登録したい。AIが正確なアドバイスをくれるようにするため。
- ゴルファーとして、スマホでもPCでも同じデータにアクセスしたい。プレー中はスマホ、振り返りはPCで使いたいため。

### EPIC-002: コース情報管理
- ゴルファーとして、コース名で検索してゴルフ場情報を取得したい。事前にコース攻略を準備するため。
- ゴルファーとして、各ホールにメモ（注意点・攻略法）を追加したい。ラウンド中にすぐ参照するため。

### EPIC-003: AIキャディー
- ゴルファーとして、各ショット前にAIからクラブ推奨と戦略を受け取りたい。疲れていても適切な判断をするため。
- ゴルファーとして、バンカーや打ち下ろし等の状況で具体的な注意点を確認したい。ミスを減らすため。
- ゴルファーとして、アドバイスを音声で聞きたい。スマホ画面を見続けなくてもよいため。

### EPIC-004: スコア・ショット記録
- ゴルファーとして、ボタン2タップ以内でスコアを記録したい。プレーの流れを止めたくないため。
- ゴルファーとして、ショット後の気づきを音声で記録したい。文字入力の時間がないため。

### EPIC-005: データアナリスト
- ゴルファーとして、YouTube動画のゴルフ知見を分析・蓄積したい。プレー中に活用できるようにするため。

### EPIC-006: AI分析
- ゴルファーとして、ラウンド後にスコア傾向やミスパターンの分析を見たい。次のラウンドに活かすため。

---

## User Flows

### フロー1: ラウンド前の準備（PC・ローカル）

```
1. コース検索（楽天GORA API連携）
2. コース情報確認、ホール別メモ追加
3. Claudeサブスクでコース攻略相談（手動対話）
4. 分析結果・攻略メモをアプリに登録
5. アプリが「プレー用コンテキスト」を自動構築:
   ├─ プレーヤープロファイル
   ├─ 当日コース全ホール情報＋攻略メモ
   ├─ ナレッジベース（状況別注意点）
   └─ 過去の傾向（後半の崩れ等）
6. コンテキスト構築完了 → プレー準備OK
```

### フロー2: ラウンド中の利用（スマホ・オンライン）

```
ラウンド開始（事前構築コンテキストがロード済み）
  → ホール1 開始
    → 状況入力（ボタン: ティーショット/残り距離/ライ等）
    → Gemini API呼び出し（コンテキスト＋状況）
    → AIアドバイス表示/音声読み上げ
    → ショット実行
    → ショット結果記録（ボタン）
    → 気づきメモ（音声入力）
    → [セカンド以降も同様]
    → ホールスコア記録
  → ホール2〜18 繰り返し
  → ラウンド終了
```

### フロー3: ラウンド後の振り返り（PC・ローカル）

```
1. アプリでスコア・メモ一覧を確認
2. スコアデータをエクスポート/コピー
3. Claudeサブスクで傾向分析を依頼（手動対話）
4. 改善点をアプリのプロファイル/ナレッジに反映
5. 次回ラウンドのコンテキストに自動反映
```

### フロー4: YouTube動画分析（PC・ローカル）

```
1. Claudeサブスクに YouTube URL を渡して分析依頼（手動対話）
2. 抽出された知見を確認
3. アプリのナレッジベースに登録
4. 次回プレー用コンテキストに自動反映
```

---

## Dependencies

### Internal Dependencies

- AIアドバイス生成にはユーザープロファイルとコース情報が必要（EPIC-001, 002 → 003）
- AI傾向分析にはスコアデータの蓄積が必要（EPIC-004 → 006）
- 状況別注意点にはナレッジベースが必要（EPIC-005 → 003の一部）

### External Dependencies

- **楽天GORA API:** コース情報取得（無料、要API登録）
- **YouTube Data API / AI分析基盤:** 動画内容の分析
- **Web Speech API:** 音声入力・読み上げ（ブラウザ内蔵）
- **Google Gemini API（Flash-Lite）:** プレー中のリアルタイムアドバイス生成（無料枠1,000回/日。OpenAI互換形式で実装し、将来のプロバイダー切り替えに備える）
- **OpenStreetMap（将来）:** GPS連携時のコースマップデータ

---

## Assumptions

1. ユーザーはプレー中にスマートフォンでインターネット接続が可能である
2. 楽天GORA APIの無料枠で十分な回数のコース検索が行える
3. Web Speech API によるブラウザ内蔵の音声認識で実用的な精度が得られる
4. YouTube動画の字幕/音声からClaudeサブスクを通じて有用なゴルフ知見を抽出できる
5. ユーザーはClaudeのサブスクリプションを契約済みである
6. プレー前後の利用はPC上のローカル環境（localhost）で十分である
7. ローカル環境とオンラインサーバー間のデータ同期が実現可能である

---

## Out of Scope

- ネイティブアプリ（iOS/Android）開発
- オフライン対応
- GPS によるリアルタイム位置追跡（将来検討）
- スマートウォッチ専用UI（将来検討、ブラウザ経由での閲覧は可能）
- ゴルフ場予約機能
- SNS・ソーシャル機能
- 動画撮影・スイング解析
- 課金・有料プラン

---

## Open Questions

| # | 質問 | 影響 |
|---|------|------|
| 1 | 楽天GORA APIで個別ホールの詳細距離（ヤーデージ）は取得できるか？ | コース情報の精度 |
| 2 | YouTube動画の分析にはどのAI（LLM）を使うか？コストは？ | 技術選定、運用コスト |
| 3 | Web Speech API の日本語認識精度はゴルフ用語で実用的か？ | 音声入力の実現方法 |
| 4 | 将来の仲間展開時、データ共有（コース攻略メモ等）は必要か？ | アーキテクチャ設計 |

---

## Approval & Sign-off

### Stakeholders

| 名前 | 役割 | 責任範囲 |
|------|------|----------|
| kishida | プロダクトオーナー / 開発者 | 全体の方針決定・開発 |

### Approval Status

- [ ] Product Owner

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-20 | kishida | Initial PRD |
| 1.1 | 2026-03-20 | kishida | 運用コスト最小化要件（NFR-008）追加、データアナリスト（EPIC-005）をCould Have・最後に実装へ変更、実装順序明示 |
| 1.2 | 2026-03-20 | kishida | ハイブリッド構成（ローカル＋オンライン）採用、Claudeサブスク活用によるAPI課金最小化、NFR-008詳細化 |
| 1.3 | 2026-03-20 | kishida | コンテキスト事前構築型アーキテクチャを明示、User Flows全面改訂（準備→プレー→振り返り→YouTube分析の4フロー） |
| 1.4 | 2026-03-20 | kishida | LLM APIをGoogle Gemini API（Flash-Lite）に決定、OpenAI互換形式で実装、月間コスト見積もり追加（¥0〜20円/月） |

---

## Next Steps

### Phase 3: Architecture

Run `/architecture` to create system architecture based on these requirements.

The architecture will address:
- All functional requirements (FRs)
- All non-functional requirements (NFRs)
- Technical stack decisions
- Data models and APIs
- System components

### Phase 4: Sprint Planning

After architecture is complete, run `/sprint-planning` to:
- Break epics into detailed user stories
- Estimate story complexity
- Plan sprint iterations
- Begin implementation

---

**This document was created using BMAD Method v6 - Phase 2 (Planning)**

*To continue: Run `/workflow-status` to see your progress and next recommended workflow.*

---

## Appendix A: Requirements Traceability Matrix

| Epic ID | Epic Name | Functional Requirements | Story Count (Est.) |
|---------|-----------|-------------------------|-------------------|
| EPIC-001 | ユーザー基盤 | FR-009, FR-016, FR-017 | 5-7 |
| EPIC-002 | コース情報管理 | FR-010, FR-011 | 4-6 |
| EPIC-003 | AIキャディー | FR-001, FR-002, FR-003, FR-004 | 6-10 |
| EPIC-004 | スコア・ショット記録 | FR-005, FR-006, FR-007, FR-008 | 5-8 |
| EPIC-005 | データアナリスト | FR-012, FR-013 | 4-6 |
| EPIC-006 | AI分析（ラウンド後） | FR-014, FR-015 | 4-6 |

---

## Appendix B: Prioritization Details

### Functional Requirements

| Priority | Count | FRs |
|----------|-------|-----|
| **Must Have** | 10 | FR-001, FR-004, FR-005, FR-006, FR-008, FR-009, FR-010, FR-014, FR-016, FR-017 |
| **Should Have** | 5 | FR-002, FR-003, FR-007, FR-011, FR-015 |
| **Could Have** | 2 | FR-012, FR-013（データアナリスト系 — 最後に実装） |

### Non-Functional Requirements

| Priority | Count | NFRs |
|----------|-------|------|
| **Must Have** | 6 | NFR-001, NFR-002, NFR-003, NFR-005, NFR-006, NFR-008 |
| **Should Have** | 2 | NFR-004, NFR-007 |

### 実装順序

| 順序 | Epic | 優先度 |
|------|------|--------|
| 1 | EPIC-001: ユーザー基盤 | Must Have |
| 2 | EPIC-002: コース情報管理 | Must Have |
| 3 | EPIC-004: スコア・ショット記録 | Must Have |
| 4 | EPIC-003: AIキャディー | Must Have |
| 5 | EPIC-006: AI分析（ラウンド後） | Should Have |
| 6 | EPIC-005: データアナリスト | Could Have |

### MVP Scope (Must Have)

合計 10 FR + 6 NFR = 推定 20-31 ストーリー
