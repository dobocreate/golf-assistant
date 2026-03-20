# Sprint Plan Review: Golf Assistant

**Date:** 2026-03-21
**Reviewer:** Codex (OpenAI o3)
**Reviewed Documents:**
- PRD v1.4: `docs/prd-golf-assistant-2026-03-20.md`
- Architecture v1.0: `docs/architecture-golf-assistant-2026-03-20.md`
- Sprint Plan: `docs/sprint-plan-golf-assistant-2026-03-20.md`

**Review Scope:** PRD・アーキテクチャ・スプリント計画の3文書間の整合性、リスク、改善点

---

## Review Summary

方向性は良いが、「実装順序」と「要件トレーサビリティ」の精度が不足している。まず文書間の前提と優先度を揃え、その後にスプリントを組み直すべき。

---

## Findings

### High（重大）

#### H-1: スプリント計画の数値が不整合

**場所:** sprint-plan L15, L21-23, L637, L702

計画書は「MVP 16ストーリー / 62pt / 4スプリント」と記載しているが、実際にはSTORY-001〜018の **18件 / 76pt / 5スプリント（Week 0-4）**。Executive Summary の集計が実際のストーリー一覧と合っていない。計画の信頼性を損ねている。

**対応案:** Executive Summary の数値を実態に合わせて修正する（18ストーリー / 76pt / 5スプリント）。

---

#### H-2: 依存関係の逆転 — STORY-007 と STORY-012

**場所:** sprint-plan L231, L236, L356, L378

STORY-007（Sprint 2）で「コンテキストスナップショットを自動構築・保存」と定義しているが、その実装本体である STORY-012（コンテキストビルダー）は Sprint 3 に配置されている。STORY-007 は STORY-012 に依存すべき。

**対応案:** STORY-012 を Sprint 2 に前倒しし、STORY-007 がそれに依存する形に修正する。または STORY-007 のコンテキスト構築部分を簡易版（スタブ）に限定し、Sprint 3 で本格実装する。

---

#### H-3: PRD とアーキテクチャの前提不一致（ハイブリッド vs 全クラウド）

**場所:** prd L703, L735, L780 / architecture L23, L27

PRD は「PC・ローカルで準備/振り返り、スマホ・オンラインでプレー」のハイブリッド前提だが、アーキテクチャは「全機能クラウド、同期不要」に変更済み。この不一致が FR-011/12/15 の実装責務と MVP 定義に直接影響する。

**対応案:** PRD を「全クラウド」前提に改訂し、ローカル/オンライン分離の記述を削除する。FR-011/12/15 の「Claudeサブスク手動運用」部分はアプリ外の運用手順として明記する。

---

#### H-4: 要件トレーサビリティの不正確さ

**場所:** prd L104, L252, L270, L320, L885 / sprint-plan L32, L749, L758, L762

- FR-011（ラウンド前プレビュー）、FR-012（YouTube動画分析）、FR-015（AI傾向分析）は実装ストーリーがなく「Claudeサブスクで手動運用」に代替されている。FRとして残すなら運用前提に降格すべき。
- FR-002 は PRD 本文では **Must Have** だが、付録 B では **Should Have** と記載されており矛盾。スプリント計画でも Post-MVP 方針と Sprint 3 での部分実装が混在している。
- FR-003 も PRD 本文では **Should Have** だが、スプリント計画では STORY-015 で Must Have として Sprint 3 に配置されている。

**対応案:**
- FR-011/12/15 を FR から「運用前提」に降格するか、将来の実装候補として Post-MVP に明示移動する。
- FR-002/003 の優先度を PRD 全体で統一する。

---

#### H-5: RLS 設計の矛盾

**場所:** architecture L661, L676-679, L1339

SQL 定義で `courses` と `holes` テーブルに `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` が記載されていないにもかかわらず、その直後にポリシー（`Courses are readable by all`、`Holes are readable by all`）だけ定義されている。RLS が有効でないテーブルにポリシーを作成しても機能しない。

**対応案:** `courses` と `holes` にも `ENABLE ROW LEVEL SECURITY` を追加する。

---

### Medium（中程度）

#### M-1: Must Have FR のカバレッジ漏れ

**場所:** prd L143 → sprint-plan L315 / prd L226 → sprint-plan L141 / prd L361 → sprint-plan L109

以下の Must Have 要件がストーリーの受け入れ条件に反映されていない:

| PRD 要件 | 不足箇所 |
|---------|---------|
| FR-004「読み上げ速度が調整可能」 | STORY-010 の AC に未記載 |
| FR-009「得意なショット・距離帯を登録」「状況別傾向の自由記述」 | STORY-004 の AC に未記載 |
| FR-017「データがリアルタイムで同期」「複数デバイスからアクセス」 | STORY-003 の AC に未記載 |

**対応案:** 各ストーリーの AC を PRD の Must Have 要件と突合し、不足分を追加する。

---

#### M-2: NFR の検証がバックログ化されていない

**場所:** prd L383, L451 / architecture L883, L1250, L1337 / sprint-plan L807

PRD は以下を Must Have として定義しているが、検証方法がストーリーや DoD に落ちていない:

- NFR-001: UI レスポンス 200ms 以内、AI アドバイス 5 秒以内、スコア保存 1 秒以内
- NFR-003: RLS ポリシーの動作確認
- NFR-005: ネットワーク切断時のローカルバッファ → 再送
- NFR-006: iOS Safari / Android Chrome / PC Chrome / Edge での動作確認

アーキテクチャで定義した「RLS テスト」「multi-browser テスト」「local buffer 再送検証」も計画に反映されていない。

**対応案:** DoD に以下を追加する:
- RLS ポリシーの動作確認
- iOS Safari / Android Chrome での実機確認
- 保存・応答時間の計測（目標値との比較）

---

#### M-3: 1人開発に対してポイント配分が攻めすぎ

**場所:** sprint-plan L637, L667, L684

1人開発・1週間スプリントに対して、以下のポイント配分は外部サービス統合を含むため非現実的:

| Sprint | Points | 内容 |
|--------|--------|------|
| Sprint 0 | 15pt | 初期構築 + Auth + 全テーブル/RLS + デプロイ + レイアウト |
| Sprint 2 | 17pt | スコア + 音声入力 + 音声出力 + ローカルバッファ |
| Sprint 3 | 21pt | LLM統合 + ストリーミング + UI + コンテキスト反映 |

アーキテクチャ文書自身が 7 段階の実装順序を推奨しており、4 週間 MVP はかなり非現実的。

**対応案:** 初回スプリントは 8-12pt、外部統合を含む重い週でも 13-15pt に抑える。Sprint を 6-7 本に延長するか、MVP スコープを縮小する。

---

### Low（軽微）

#### L-1: データモデルのズレ — course_notes テーブル

**場所:** architecture L479, L590

ER 図に `course_notes` テーブルが存在するが、SQL 定義（DDL）が存在しない。スプリント計画でも扱われていない。

**対応案:** `course_notes` を ER 図から削除するか、SQL 定義を追加する。`hole_notes` で代替可能であれば ER 図を修正する。

---

## Recommendations（改善提案まとめ）

| # | 提案 | 優先度 |
|---|------|--------|
| 1 | PRD/Architecture/Sprint Plan の前提を「全クラウド」に統一する | High |
| 2 | STORY-012 を Sprint 2 に前倒し、STORY-007 の依存関係を修正する | High |
| 3 | Sprint 0-1 に技術スパイクを追加する（Gemini streaming、Web Speech API 実機検証、RLS policy test、local buffer/retry） | High |
| 4 | MVP を再定義する — FR-002/3/11/12/15 を正式に Post-MVP へ降格するか、Sprint を 6-7 本へ延長する | High |
| 5 | Executive Summary の集計数値を実態（18件 / 76pt / 5スプリント）に修正する | High |
| 6 | FR-002/003 の優先度を PRD 全体で統一する | Medium |
| 7 | 各ストーリーの AC を PRD Must Have 要件と突合し、不足分を追加する | Medium |
| 8 | DoD に「RLS 確認」「iOS Safari / Android Chrome 実機確認」「保存/応答時間の計測」を追加する | Medium |
| 9 | スプリントのポイント上限を 13-15pt に設定し、スプリント数を延長する | Medium |
| 10 | ER 図の `course_notes` を整理する（削除 or DDL 追加） | Low |

---

## Conclusion

全体の方向性は妥当だが、文書間の前提・優先度・数値の不整合を先に解消すべき。特に「ハイブリッド vs 全クラウド」の前提統一と、STORY-007/012 の依存関係修正は、実装開始前に必ず対応が必要。

スプリント計画の修正を行った上で、Sprint 0 に着手することを推奨する。

---

## Cross-Review: 複数視点からの検証

Codex レビューに対して PM・テックリード・QA の 3 視点で検証を実施した。以下はその統合結果である。

### 視点別のレビュー品質評価

| 視点 | Codex 評価 | コメント |
|------|-----------|---------|
| PM | 7/10 | 指摘の 8 割は妥当。ただし改善提案の優先度が個人開発 MVP の実態に合っていない |
| テックリード | 8/10 | 文書整合性チェックは高精度。実装時の技術的落とし穴の分析が弱い |
| QA | 良好（文書品質◎、ソフトウェア品質△） | 静的分析は強いが、利用環境固有の動的品質リスク分析が不足 |

---

### Finding 別の合意状況

| Finding | PM | Tech Lead | QA | 合意結果 |
|---------|----|-----------|----|---------|
| H-1: 数値不整合 | 一部同意（Codex自身の計算も不完全） | 同意 | - | **同意（修正必要）** |
| H-2: 依存関係逆転 | 同意（対応はSTORY-007簡素化が現実的） | 同意（STORY-012前倒しはSprint 2過負荷） | 同意 | **同意（STORY-007のAC簡素化で対応）** |
| H-3: 前提不一致 | 同意（ただし重要度はMedium相当） | 同意（PRD文言修正で足りる） | 同意（NFR-005への影響も考慮すべき） | **同意（文言修正レベル、重要度Medium寄り）** |
| H-4: トレーサビリティ | 部分同意 | 部分同意 | - | **同意（FR-002/003の優先度統一が最優先）** |
| H-5: RLS矛盾 | 同意（重要度はMediumに下げるべき） | 同意（INSERT/DELETE権限も要検討） | 同意（セキュリティバグの温床） | **同意（ただしcoursesは公開データで実害は限定的）** |
| M-1: ACカバレッジ漏れ | 同意（FR-017は全クラウドなら自動充足） | 同意 | 同意 | **同意** |
| M-2: NFR検証不足 | 部分同意（個人開発MVPでは過剰な面あり） | 同意 | 同意（ただし具体性が不足） | **同意（具体的な検証基準を定義すべき）** |
| M-3: ポイント過多 | 部分同意（Sprint 3のみが本当のリスク） | 部分同意（Sprint 0/1は達成可能） | 同意 | **部分同意（Sprint 3のみ要調整）** |
| L-1: course_notes | 同意 | 同意 | - | **同意** |

---

### Codex が見落としていた観点

#### 技術的リスク（テックリード指摘）

| # | リスク | 影響度 | 対応タイミング |
|---|-------|--------|-------------|
| T-1 | Vercel Serverless Function 10秒タイムアウト（Free Tier）とGemini APIストリーミングの関係。Edge Runtime使用時はSupabase接続方法が変わる | 高 | Sprint 0（技術スパイク） |
| T-2 | Supabase Auth + Next.js 15 App Router の認証パターンの複雑さ（Server Component/Action/Middlewareで異なるクライアント初期化） | 中 | Sprint 0（STORY-002内） |
| T-3 | Gemini Flash-Lite の構造化出力（JSON Mode）の信頼性。`generateObject()` や zod バリデーションが必要だが未記載 | 中 | Sprint 2（技術スパイク） |
| T-4 | 楽天GORA API のホール別詳細データ取得可否が未検証（Open Questions #1のまま） | 中 | Sprint 0（技術スパイク） |
| T-5 | courses テーブルへの INSERT 権限設計が不明確（認証ユーザー? サービスロール?）、UPSERT戦略の記載なし | 低 | Sprint 1（STORY-005内） |

#### 品質リスク（QA 指摘）

| # | リスク | 影響度 | 対応タイミング |
|---|-------|--------|-------------|
| Q-1 | ゴルフ場特有のネットワーク環境（山間部、基地局ハンドオーバー、帯域圧迫）。PRDの「通信は十分」前提は楽観的 | 高 | Sprint 2（NFR-005検証） |
| Q-2 | Web Speech API のブラウザ間差異（iOS Safariのバックグラウンド停止、連続使用時のマイク許可再要求） | 高 | Sprint 0-1（技術スパイク） |
| Q-3 | 屋外ノイズによる音声認識精度低下（風切り音、カートエンジン音、同伴者の声） | 中 | Sprint 2（実地テスト） |
| Q-4 | 楽観的UI更新とlocalStorageバッファの競合によるデータ二重登録の可能性 | 中 | Sprint 2（STORY-008設計時） |
| Q-5 | 手袋着用時のタッチ操作性、直射日光・偏光サングラスでの視認性 | 中 | Sprint 2（実地テスト） |
| Q-6 | 18ホール（4-5時間）使用時のバッテリー消費（音声API + 高輝度 + ストリーミング） | 低 | Sprint 4（MVP仕上げ） |

#### プロダクト観点（PM 指摘）

| # | 観点 | 対応 |
|---|------|------|
| P-1 | STORY-010（音声読み上げ）がSprint 2だが、読み上げ対象のAIアドバイスはSprint 3まで存在しない | Sprint 3に移動、またはダミーテキストでの検証を明記 |
| P-2 | 楽天GORA APIの仕様確認がSprint 1のSTORY-005で初出。Sprint 0で技術調査に含めるべき | Sprint 0に技術調査を追加 |
| P-3 | Claude手動運用フローの具体的UX（どの画面からデータをコピーしてClaudeに渡すか）が未定義 | STORY-016のAC「テキストコピー」で部分カバー。補足が必要 |

---

### Recommendation の優先度再評価

3視点の検証結果を踏まえ、Codex の改善提案を個人開発 MVP の文脈で再評価する。

| # | Codex 提案 | 元の優先度 | 再評価 | 理由 |
|---|-----------|-----------|--------|------|
| 1 | 前提を「全クラウド」に統一 | High | **High** | 全視点で同意。文言修正のみで作業量小 |
| 2 | STORY-012前倒し/STORY-007依存修正 | High | **High** | 全視点で同意。ただし対応は「STORY-007のAC簡素化」が現実的（STORY-012前倒しはSprint 2過負荷） |
| 3 | 技術スパイク追加 | High | **High** | テックリード・QA共に具体的スパイクを追加提案。P0: Gemini streaming + Edge Runtime、楽天GORA APIレスポンス確認、Web Speech API実機検証 |
| 4 | MVP再定義/Sprint延長 | High | **Low** | PMが異議。FR-011/12/15は既にClaude手動運用で除外済み。Sprint全体延長はモチベーション面でマイナス |
| 5 | Executive Summary数値修正 | High | **High** | 全視点で同意。5分で完了 |
| 6 | FR-002/003の優先度統一 | Medium | **High** | PM指摘で格上げ。混乱の元であり早期修正が必要 |
| 7 | ACのMust Have要件突合 | Medium | **Medium** | 同意。各Sprint開始時に該当ストーリーのACを確認する運用で十分 |
| 8 | DoDにNFR検証追加 | Medium | **Medium** | QAが具体的な検証基準を提案。ただし項目は最小限に絞る |
| 9 | ポイント上限設定/Sprint延長 | Medium | **Low** | Sprint 3のみSTORY-015をSprint 4に移動すれば18pt/13ptとなり解決。全体延長は不要 |
| 10 | course_notes整理 | Low | **Low** | 同意 |

#### 新規追加の Recommendation

| # | 提案 | 優先度 | 出典 |
|---|------|--------|------|
| 11 | Sprint 0にP0技術スパイクを追加: Gemini streaming + Edge Runtime動作確認、楽天GORA APIホール別データ取得確認 | **High** | テックリード |
| 12 | Sprint 0-1にWeb Speech API実機検証を追加（iOS Safari/Android Chrome、屋外ノイズ環境） | **High** | QA |
| 13 | STORY-010をSprint 3に移動（読み上げ対象のAIアドバイスがSprint 3まで存在しないため） | **Medium** | PM |
| 14 | courses/holesテーブルのINSERT権限設計を明確化（UPSERT戦略含む） | **Medium** | テックリード |
| 15 | Sprint 3のSTORY-015をSprint 4に移動し、Sprint 3を18pt/Sprint 4を13ptに調整 | **Medium** | PM + テックリード |
| 16 | DoDにNFR検証の具体的基準を追加（QA提案ベース） | **Medium** | QA |

---

### 推奨する対応順序（Sprint 0 開始前）

以下の対応は Sprint 0 開始前に 1-2 時間で完了可能:

1. Executive Summary の数値修正（Rec #5）
2. STORY-007 の AC 簡素化 — コンテキスト構築を Sprint 3 に移動（Rec #2）
3. FR-002/003 の優先度を PRD 全体で統一（Rec #6）
4. PRD のローカル/オンライン記述を全クラウド前提に修正（Rec #1）
5. FR-011/12/15 を Post-MVP に明示移動（Rec #4 の一部）
6. courses/holes の `ENABLE ROW LEVEL SECURITY` 追加（H-5）
7. STORY-010 を Sprint 3 に移動、STORY-015 を Sprint 4 に移動（Rec #13, #15）

Sprint 0 内で実施すべき技術スパイク:

- Gemini API streaming + Vercel Edge Runtime 動作検証（Rec #11）
- 楽天GORA API ホール別データ取得可否の確認（Rec #11）
- Web Speech API の iOS Safari / Android Chrome 実機テスト（Rec #12）

---

### QA 提案: DoD 改定案

```
Definition of Done（改定版）:
- [ ] 機能が動作する（Acceptance Criteria を満たす）
- [ ] TypeScript エラーがない
- [ ] 主要パスのテストが存在する
- [ ] Vercel にデプロイされ、動作確認済み
- [ ] レスポンシブ対応（PC + モバイル）
- [ ] iOS Safari + Android Chrome での基本動作確認（Sprint 2 以降）
- [ ] ネットワーク低速時（3G Slow 相当）でも致命的エラーが発生しない（Sprint 2 以降）
- [ ] RLS ポリシーが正しく動作する（データアクセスを伴うストーリーのみ）
- [ ] エラー発生時にユーザーに適切なフィードバックが表示される
```

### QA 提案: NFR 検証計画

**NFR-001: パフォーマンス**

| 指標 | 測定方法 | 合格基準 | 実施タイミング |
|------|---------|---------|-------------|
| UI レスポンス | Lighthouse + Chrome DevTools | ボタンタップ → 画面反映 200ms 以内 | Sprint 2 以降 |
| AI アドバイス表示開始 | `performance.now()` 計測 | リクエスト → 最初のチャンク 5 秒以内 | Sprint 3 |
| スコア保存 | Server Action 実行時間ログ | 1 秒以内 | Sprint 2 |

**NFR-005: 信頼性**

| シナリオ | テスト方法 | 合格基準 |
|---------|---------|---------|
| スコア保存中にネットワーク断 | DevTools offline | localStorage に保存、復帰後に同期 |
| 複数ホール分バッファ蓄積後の復帰 | offline で 3 ホール入力 → online | 全データ正しく同期、二重登録なし |
| ブラウザクラッシュ後の復帰 | 強制終了 → 再起動 | 直前までのスコアデータが保持 |

**NFR-006: ブラウザ互換性**

| ブラウザ | デバイス | 検証内容 |
|---------|---------|---------|
| iOS Safari 17+ | iPhone 13 以降 | 全機能 + Web Speech API |
| Android Chrome 120+ | Pixel 7 以降 | 全機能 + Web Speech API |
| PC Chrome | Windows/Mac | 振り返り・プロファイル管理 |
| PC Edge | Windows | 振り返り・プロファイル管理 |
