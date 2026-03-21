# Post-MVP Sprint 2 — 設計ドキュメント

## 概要

STORY-019〜023 の Playwright 検証完了後、以下4タスクを新規追加。
本ドキュメントはセッション間の引き継ぎ用に、調査結果・設計案・DB変更をすべて記録する。

---

## タスク一覧

| # | タスク | 状態 |
|---|--------|------|
| 1 | ホールインポートCSV様式の説明追加とサンプルダウンロード | in_progress（設計完了、実装未着手） |
| 2 | スコア入力画面の再設計（楽天ゴルフスコアアプリ参考） | in_progress（設計完了、実装未着手） |
| 3 | ラウンド完了後のスコア編集機能 | in_progress（設計完了、実装未着手） |
| 4 | AIアドバイス画面の改善（ホール選択・傾斜入力） | in_progress（設計完了、実装未着手） |

---

## タスク1: ホールインポートCSV様式の説明追加とサンプルダウンロード

### 調査結果

Web調査（楽天GORA, GDO, Golf Network+, 18Birdies, Arccos, Golfshot等）から、以下の情報を確認:

- **スコアカード記載項目**: Par, ティー別距離(バック/レギュラー/フロント/レディース), HDCP(難易度順位1〜18)
- **コースガイド/ヤーデージブック**: ドッグレッグ方向, 高低差, バンカー/池/OBの位置, グリーン特徴
- **AIキャディーに有効**: HDCP(リスク管理), ドッグレッグ(狙い方向), 高低差(実効距離補正), ハザード/OB(リスク回避)
- **除外**: GPS座標, グリーン傾斜マップ, フェアウェイ幅, 風向き, ピン位置（テキスト入力に不向き or ホール固有でない）

### 現状

- `src/features/course/components/hole-import.tsx` に HoleImport コンポーネントが存在
- CSV形式: `ホール番号,Par,距離,説明` の4カラムのみ
- テキストエリアに貼り付け → プレビュー → インポートの3ステップ
- `src/actions/course.ts` の `importHoles()` で処理

### 確定項目（12カラム）

| # | CSVヘッダー | DBカラム | 型 | 必須 | 既存/新規 | バリデーション |
|---|------------|---------|-----|------|-----------|---------------|
| 1 | ホール番号 | `hole_number` | integer | 必須 | 既存 | 1〜18 |
| 2 | Par | `par` | integer | 必須 | 既存 | 3〜5 |
| 3 | 距離 | `distance` | integer | 任意 | 既存 | 0〜700 (yd) ※レギュラーティー |
| 4 | HDCP | `hdcp` | integer | 任意 | **新規** | 1〜18 |
| 5 | ドッグレッグ | `dogleg` | text | 任意 | **新規** | straight / left / right |
| 6 | 高低差 | `elevation` | text | 任意 | **新規** | flat / uphill / downhill |
| 7 | バックティー | `distance_back` | integer | 任意 | **新規** | 0〜700 (yd) |
| 8 | フロントティー | `distance_front` | integer | 任意 | **新規** | 0〜700 (yd) |
| 9 | レディースティー | `distance_ladies` | integer | 任意 | **新規** | 0〜700 (yd) |
| 10 | ハザード | `hazard` | text | 任意 | **新規** | 自由記述 |
| 11 | OB | `ob` | text | 任意 | **新規** | 自由記述 |
| 12 | 説明 | `description` | text | 任意 | 既存 | 自由記述 |

### DB変更（Supabaseマイグレーション）

```sql
-- holes テーブルへの追加カラム（8カラム新規追加）
ALTER TABLE holes ADD COLUMN hdcp integer CHECK (hdcp BETWEEN 1 AND 18);
ALTER TABLE holes ADD COLUMN dogleg text CHECK (dogleg IN ('straight', 'left', 'right'));
ALTER TABLE holes ADD COLUMN elevation text CHECK (elevation IN ('flat', 'uphill', 'downhill'));
ALTER TABLE holes ADD COLUMN distance_back integer CHECK (distance_back BETWEEN 0 AND 700);
ALTER TABLE holes ADD COLUMN distance_front integer CHECK (distance_front BETWEEN 0 AND 700);
ALTER TABLE holes ADD COLUMN distance_ladies integer CHECK (distance_ladies BETWEEN 0 AND 700);
ALTER TABLE holes ADD COLUMN hazard text;
ALTER TABLE holes ADD COLUMN ob text;
```

### Hole型の変更 (`src/features/course/types.ts`)

```typescript
export interface Hole {
  id: string;
  course_id: string;
  hole_number: number;
  par: number;
  distance: number | null;           // レギュラーティー距離
  hdcp: number | null;               // 新規: 難易度順位(1〜18)
  dogleg: 'straight' | 'left' | 'right' | null;  // 新規
  elevation: 'flat' | 'uphill' | 'downhill' | null;  // 新規
  distance_back: number | null;      // 新規: バックティー距離
  distance_front: number | null;     // 新規: フロントティー距離
  distance_ladies: number | null;    // 新規: レディースティー距離
  hazard: string | null;             // 新規: ハザード情報
  ob: string | null;                 // 新規: OB/ペナルティエリア
  description: string | null;
}
```

### サンプルCSV

```
ホール番号,Par,距離,HDCP,ドッグレッグ,高低差,バックティー,フロントティー,レディースティー,ハザード,OB,説明
1,4,380,7,right,uphill,410,340,290,右バンカー2個,左OB,右ドッグレッグの打ち上げ
2,3,165,15,straight,downhill,185,140,120,グリーン手前バンカー,,池越えのショートホール
3,5,520,3,left,flat,550,480,430,右池・FWバンカー,右OB,左ドッグレッグのロング
```

### 変更対象ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `src/features/course/types.ts` | Hole型に8カラム追加 |
| `src/features/course/components/hole-import.tsx` | CSV様式説明追加、12カラムパース対応、プレビューテーブル拡張、サンプルCSVダウンロード |
| `src/actions/course.ts` | `importHoles()` の HoleImportData型拡張、upsert対象カラム追加、バリデーション追加。`upsertHole()` も新カラム対応 |
| `src/features/course/components/hole-list.tsx` | ホール一覧表示に新カラム表示追加（HDCP, ドッグレッグ等） |
| `supabase/migrations/00004_add_hole_details.sql` | 新規マイグレーションファイル |
| `src/features/advice/lib/context-builder.ts` | ホール情報のコンテキスト構築に新カラムを含める |

### UIの変更方針

1. **CSV様式の説明**: 折りたたみ内に各カラムの説明テーブルを追加
2. **サンプルCSV**: ダウンロードボタン追加（Blob URLで動的生成、ファイルは不要）
3. **プレビューテーブル**: 12カラムは横スクロールで対応（モバイル考慮）
4. **ヘッダー行対応**: CSVの1行目がヘッダー（「ホール番号」で始まる）の場合は自動スキップ
5. **日本語入力対応**: ドッグレッグ・高低差は日本語でも受付（「左」→ left、「打ち上げ」→ uphill 等に自動変換）

### CSVパース仕様（照査指摘 #1 対応）

- **引用符対応**: ハザード・OB・説明にカンマが含まれる場合に備え、ダブルクォート囲みに対応する（RFC4180準拠）
  - 例: `1,4,380,7,right,uphill,410,340,290,"右バンカー2個, グリーン手前池",左OB,右ドッグレッグ`
- **旧4カラムCSV後方互換**: カラム数が4以下の行は旧形式（ホール番号,Par,距離,説明）として処理する。5カラム以上の行は新12カラム形式として処理する。1ファイル内で混在は不可（最初のデータ行のカラム数で判定）
- **パーサ実装**: 単純な `split(',')` から RFC4180対応のパース関数に置き換え

### 注意事項（照査指摘 #9）

- `holes` テーブルは認証済みユーザーなら誰でも UPDATE 可能（migration 00003 で追加済み）。8カラム追加で改ざん面積が拡大するが、これは既存の設計方針（コース情報は共有データ）に基づく。将来的にコース管理者ロールを導入する際に対応する

---

## タスク2: スコア入力画面の再設計

### 調査結果: 楽天GORAアプリ等のスコア入力UI

#### 共通する入力項目（楽天GORA / GDO / Golf Network+）

**コア項目:**
- 総打数（パット含む）
- パット数
- ティーショット方向（左/中/右）
- FWキープ（方向から自動判定可能）
- パーオン（GIR）

**追加項目:**
- OB数
- バンカー数
- ペナルティ数
- 使用クラブ（ティーショット）
- サンドセーブ

#### UI/UXパターン

**入力方式:**
- パターンA: +/-インクリメント方式（Par基準の加減）— GDO
- パターンB: ダイレクトナンバーボタン — 楽天GORA
- 現在の実装はパターンBに近い（ボタンでタップ選択）

**レイアウト:**
- フルスクリーンカード/ホール単位
- スワイプでホール移動
- 片手操作に最適化
- 屋外視認性のためダークモード・大きいフォント

**自動計算:**
- パーオン = (総打数 − パット数) ≤ (Par − 2) で自動判定可能
- FWキープ = ティーショット方向が「中央」なら自動判定可能
- スコアラベル（イーグル/バーディー/パー/ボギー等）自動表示

### 現在の実装

#### Score型定義 (`src/features/score/types.ts`)

```typescript
interface Score {
  id: string;
  round_id: string;
  hole_number: number;
  strokes: number;       // 総打数（パット含む）
  putts: number | null;
  fairway_hit: boolean | null;
  green_in_reg: boolean | null;
}
```

#### scoresテーブル（現在）

```sql
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
```

#### ScoreInputコンポーネント (`src/features/score/components/score-input.tsx`)

- Props: `roundId, holes, initialScores, courseName, clubs?`
- 状態: `currentHole, scores(Map), strokes, putts, fairwayHit, greenInReg`
- 機能: ホールナビ、打数ボタン、パットボタン、FW/GIRトグル、楽観的更新、ホール切替時自動保存、ミニスコアカード

#### ShotRecorderコンポーネント (`src/features/score/components/shot-recorder.tsx`)

- 折りたたみ式、ScoreInput内に配置
- クラブ選択ドロップダウン、結果ボタン（◎○△✕）、ミスタイプ（フック等、△✕時のみ）

#### サーバーアクション (`src/actions/score.ts`)

- `upsertScore()`: roundId, holeNumber, strokes, putts, fairwayHit, greenInReg
- `getScores()`: ラウンド全スコア取得
- `getScoresWithHoles()`: ラウンド+ホール+スコア結合取得
- ラウンドステータスが `in_progress` であることを検証

### 再設計案（確定）

#### レイアウト

```
┌──────────────────────────────────┐
│ コース名            合計スコア   │
├──────────────────────────────────┤
│   [<]    Hole 5 / Par 4    [>]  │
├──────────────────────────────────┤
│ 総打数                           │
│  [2] [3] [4] [5] [6] [7] [8+]  │
│          ボギー(+1)              │
├──────────────────────────────────┤
│ パット数                         │
│  [0] [1] [2] [3] [4]           │
├──────────────────────────────────┤
│ ティーショット      パーオン     │
│  [↖] [↑] [↗]       [○][✕]     │
│  [← ] [○] [→ ]                  │
│  [↙] [↓] [↘]                   │
├──────────────────────────────────┤
│ OB   バンカー   ペナルティ       │
│ [0][1][2][3+] [0][1][2][3+] [0][1][2][3+] │
├──────────────────────────────────┤
│ ▼ ショット記録（詳細）          │
├──────────────────────────────────┤
│         [ 保存 ]                │
├──────────────────────────────────┤
│ スコア一覧                       │
│ [1][2][3]...[9]                 │
│ [10][11]...[18]                 │
└──────────────────────────────────┘
```

#### ティーショット結果: 3×3グリッド方式

```
   [↖]   [↑]   [↗]
   左長   長い   右長

   [←]    [○]   [→]
   左     中央    右

   [↙]   [↓]   [↘]
   左短   短い   右短
```

- 9方向を1タップで記録
- 中央(○) = フェアウェイセンター・想定通りの飛距離
- ←→ = 左右の方向ズレ（フック/スライス方向）
- ↑ = オーバー（想定より飛びすぎ）
- ↓ = ショート（チョロ・当たり損ない）
- 斜め = 方向＋距離の組み合わせ（例: ↘ = 右に飛んで短い）

#### DB変更（Supabaseマイグレーション）

```sql
-- scores テーブルへの追加カラム
ALTER TABLE scores ADD COLUMN tee_shot_lr text
  CHECK (tee_shot_lr IN ('left', 'center', 'right'));
ALTER TABLE scores ADD COLUMN tee_shot_fb text
  CHECK (tee_shot_fb IN ('short', 'center', 'long'));
ALTER TABLE scores ADD COLUMN ob_count integer DEFAULT 0
  CHECK (ob_count BETWEEN 0 AND 10);
ALTER TABLE scores ADD COLUMN bunker_count integer DEFAULT 0
  CHECK (bunker_count BETWEEN 0 AND 10);
ALTER TABLE scores ADD COLUMN penalty_count integer DEFAULT 0
  CHECK (penalty_count BETWEEN 0 AND 10);
```

- `tee_shot_lr`: 左右方向（left/center/right）
- `tee_shot_fb`: 前後距離（short/center/long）
- 2カラム独立保存でグリッド選択値をそのまま保存（例: `lr='right', fb='short'` = ↘）
- `fairway_hit` は `tee_shot_lr='center' AND tee_shot_fb='center'` で自動判定可能だが、既存カラムも残す（後方互換）
- **Par3 の FWキープ（照査指摘 #3）**: Par3 ホールにはフェアウェイ概念がないため、Par3 では `fairway_hit = null`、ティーショット3×3グリッドを非表示にする。サーバー側でも Par3 の場合は `fairway_hit`, `tee_shot_lr`, `tee_shot_fb` を強制的に null にする

#### Score型の変更

```typescript
interface Score {
  id: string;
  round_id: string;
  hole_number: number;
  strokes: number;           // 総打数（パット含む）
  putts: number | null;
  fairway_hit: boolean | null;
  green_in_reg: boolean | null;
  tee_shot_lr: 'left' | 'center' | 'right' | null;  // 新規
  tee_shot_fb: 'short' | 'center' | 'long' | null;   // 新規
  ob_count: number;           // 新規
  bunker_count: number;       // 新規
  penalty_count: number;      // 新規
}
```

#### upsertScore の変更

入力パラメータに以下を追加:
- `teeShotLr?: string | null`
- `teeShotFb?: string | null`
- `obCount?: number`
- `bunkerCount?: number`
- `penaltyCount?: number`

#### UIコンポーネントの変更箇所

| ファイル | 変更内容 |
|---------|---------|
| `src/features/score/types.ts` | Score型に5カラム追加 |
| `src/features/score/components/score-input.tsx` | 3×3グリッド追加（Par3非表示）、OB/バンカー/ペナルティ入力追加（3+ステッパー対応）、総打数ボタンに8+ステッパー追加、「打数」→「総打数」ラベル変更 |
| `src/actions/score.ts` | upsertScore に新カラム追加、バリデーション追加 |
| `supabase/migrations/` | 新規マイグレーションファイル追加 |

---

## タスク3: ラウンド完了後のスコア編集機能

### 現状の詳細分析

#### `upsertScore()` のステータスチェック (`src/actions/score.ts:29-35`)

```typescript
const { data: round } = await supabase
  .from('rounds')
  .select('id')
  .eq('id', data.roundId)
  .eq('user_id', user.id)
  .eq('status', 'in_progress')  // ← ここが制約
  .single();
```

`.eq('status', 'in_progress')` により completed ラウンドのスコア更新が拒否される。

#### ラウンド詳細ページ (`src/app/(main)/rounds/[roundId]/page.tsx`)

- ステータスが `in_progress` の場合のみ「プレーに戻る」リンクを表示（126行目）
- `completed` の場合はスコア編集への導線がない
- `getScoresWithHoles()` はステータスによるフィルタなし（読み取りは可能）

#### ScoreInput コンポーネント

- `roundId, holes, initialScores, courseName, clubs?` を Props で受け取る
- ラウンドステータスを直接参照していない → そのまま再利用可能
- 保存時に `upsertScore()` を呼ぶため、サーバー側の緩和だけで動作する

### 要件

- 完了済みラウンドでもスコアデータを修正可能にする
- ラウンド詳細画面（`/rounds/[roundId]`）から編集モードに入れるようにする
- 編集履歴の管理は不要（上書きでOK）

### 設計（確定）

#### 1. `upsertScore()` のステータスチェック緩和

```typescript
// 変更前
.eq('status', 'in_progress')

// 変更後
.in('status', ['in_progress', 'completed'])
```

#### 2. ラウンド詳細ページに「スコア編集」ボタン追加

`/rounds/[roundId]/page.tsx` の「プレーに戻る」リンクの下に、`completed` ステータス時のみ表示:

```tsx
{round.status === 'completed' && (
  <Link
    href={`/play/${roundId}/score?edit=1`}
    className="..."
  >
    スコアを編集
  </Link>
)}
```

#### 3. `/play/[roundId]/score` ページの対応（照査指摘 #5 修正）

- クエリパラメータ `?edit=1` がある場合、completed ラウンドでもスコア入力画面を表示
- `getScoresWithHoles()` はステータスフィルタなし → 変更不要
- **注意**: 「ラウンド完了」ボタンは `/play/[roundId]/page.tsx` にあり、`/play/[roundId]/score/page.tsx` には存在しない。スコア入力画面自体には完了ボタンがないため非表示処理は不要
- ScoreInput コンポーネントに `editMode` props を追加し、編集モード時は「ラウンド詳細に戻る」リンクを表示する（通常時はホールナビゲーションのみ）

#### 4. total_score の再計算

`upsertScore()` 成功後、ラウンドの `total_score` を再計算・更新する処理を追加:

```typescript
// upsertScore の末尾に追加
const { data: allScores } = await supabase
  .from('scores')
  .select('strokes')
  .eq('round_id', data.roundId);
if (allScores) {
  const total = allScores.reduce((sum, s) => sum + s.strokes, 0);
  await supabase
    .from('rounds')
    .update({ total_score: total })
    .eq('id', data.roundId);
}
```

### 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/actions/score.ts` | `upsertScore()` のステータスチェックを `in` に変更、total_score再計算追加、revalidatePath拡張 |
| `src/app/(main)/rounds/[roundId]/page.tsx` | 「スコア編集」ボタン追加（completedステータス時） |
| `src/app/play/[roundId]/score/page.tsx` | `?edit=1` クエリパラメータ対応、editMode props を ScoreInput に渡す |
| `src/features/score/components/score-input.tsx` | `editMode` props 追加、編集モード時に「ラウンド詳細に戻る」リンク表示 |

#### 5. revalidatePath の拡張（照査指摘 #6）

現行の `upsertScore()` は `/play/${roundId}/score` のみ再検証。completed ラウンドの編集後は以下も再検証が必要:

```typescript
revalidatePath(`/play/${data.roundId}/score`);
revalidatePath(`/rounds/${data.roundId}`);  // ラウンド詳細
revalidatePath('/rounds');                    // ラウンド一覧
revalidatePath('/rounds/stats');              // 統計ページ
```

---

## タスク4: AIアドバイス画面の改善

### 現状の詳細分析

#### AdviceClient (`src/features/advice/components/advice-client.tsx`)

- ホール選択: `useState(1)` で初期値1、+/- ボタンで1〜18を単純にインクリメント
- スコア情報を参照していない → 「次のホール」の自動判定ができない
- `roundId` のみをPropsで受け取っている

#### SituationInput (`src/features/advice/components/situation-input.tsx`)

- ショット種別: `['ティーショット', 'セカンド', 'アプローチ', 'パット']`
- 残り距離: `['〜100y', '100〜150y', '150〜200y', '200y+']`
- ライ: `['フェアウェイ', 'ラフ', 'バンカー', '林', '打ち下ろし', '打ち上げ']`
- 傾斜の入力なし
- 「打ち下ろし」「打ち上げ」はライに混在（地形情報）

#### Situation型 (`src/features/advice/types.ts`)

```typescript
interface Situation {
  holeNumber: number;
  shotType: string;
  remainingDistance: string;
  lie: string;
  notes?: string;
}
```

傾斜（slope）フィールドなし。

#### プロンプト (`src/features/advice/lib/prompt-template.ts`)

- `createUserPrompt()` で `ライ: ${situation.lie}` としてそのまま送信
- 傾斜情報を含める仕組みなし

#### context-builder.ts のホール情報

```typescript
// 59-61行目: holesの取得
.select('hole_number, par, distance, description')  // 新カラム未取得
```

### 要件

#### 4-1. ホール選択の改善
- スコア記録状況から「次にプレーするホール」を自動選択
- 1〜18すべて選択可能だが、推定される現在ホールをデフォルトにする

#### 4-2. 傾斜の項目追加
- 前後傾斜（つま先上がり/つま先下がり）と左右傾斜（左足上がり/左足下がり）の2軸
- 各軸トグル式（0 or 1選択）

#### 4-3. ライ選択肢の整理
- 「打ち下ろし」「打ち上げ」をライから除外（地形であってライではない）
- 「ティーアップ」を追加
- ライ: `['ティーアップ', 'フェアウェイ', 'ラフ', 'バンカー', '林']`

### 設計（確定）

#### Situation型の変更

```typescript
export interface Situation {
  holeNumber: number;
  shotType: string;
  remainingDistance: string;
  lie: string;
  slopeFB: 'toe_up' | 'toe_down' | null;  // 新規: 前後傾斜
  slopeLR: 'left_up' | 'left_down' | null; // 新規: 左右傾斜
  notes?: string;
}
```

#### AdviceClient の変更

- Props に `scores: Score[]` を追加（親ページから渡す）
- 初期ホール番号: 「最初の未入力ホール」を算出（照査指摘 #7: `max+1` は途中抜けで誤るため修正）

```typescript
// 初期ホール番号の算出（最初の未入力ホールを検出）
const scoredHoleSet = new Set(scores.map(s => s.hole_number));
const nextHole = Array.from({ length: 18 }, (_, i) => i + 1).find(h => !scoredHoleSet.has(h)) ?? 18;
const [currentHole, setCurrentHole] = useState(nextHole);
```

#### SituationInput の変更

**ライ選択肢の変更:**
```typescript
const LIES = ['ティーアップ', 'フェアウェイ', 'ラフ', 'バンカー', '林'];
```

**傾斜入力UIの追加:**
```
前後傾斜:  [つま先上がり]  [つま先下がり]   ← トグル（再タップで解除）
左右傾斜:  [左足上がり]    [左足下がり]     ← トグル（再タップで解除）
```

- 新しいstate: `slopeFB`, `slopeLR`
- トグル動作: 選択中のボタンを再タップで null に戻る
- ライと残り距離の間に配置

**送信条件の変更:**
- 傾斜は任意のため、`canSubmit` の条件に含めない（shotType && distance && lie のみ）

#### プロンプトへの傾斜情報反映

`createUserPrompt()` に傾斜情報を追加:

```typescript
export function createUserPrompt(situation: {
  holeNumber: number;
  shotType: string;
  remainingDistance: string;
  lie: string;
  slopeFB?: string | null;
  slopeLR?: string | null;
  notes?: string;
}): string {
  const parts = [
    `Hole ${situation.holeNumber}`,
    `ショット: ${situation.shotType}`,
    `残り距離: ${situation.remainingDistance}`,
    `ライ: ${situation.lie}`,
  ];
  // 傾斜情報
  const slopes: string[] = [];
  if (situation.slopeFB === 'toe_up') slopes.push('つま先上がり');
  if (situation.slopeFB === 'toe_down') slopes.push('つま先下がり');
  if (situation.slopeLR === 'left_up') slopes.push('左足上がり');
  if (situation.slopeLR === 'left_down') slopes.push('左足下がり');
  if (slopes.length > 0) parts.push(`傾斜: ${slopes.join('・')}`);

  if (situation.notes) parts.push(`補足: ${situation.notes}`);
  return parts.join('\n');
}
```

#### context-builder.ts のホール情報拡張

タスク1のDB変更後、新カラムもコンテキストに含める:

```typescript
// holes の select を拡張
.select('hole_number, par, distance, hdcp, dogleg, elevation, hazard, ob, description')

// formatContextForPrompt のホール情報セクションを拡張
let line = `- Hole ${h.hole_number}: Par${h.par}`;
if (h.distance) line += ` ${h.distance}y`;
if (h.hdcp) line += ` HDCP${h.hdcp}`;
if (h.dogleg && h.dogleg !== 'straight') line += ` ${h.dogleg === 'left' ? '左ドッグレッグ' : '右ドッグレッグ'}`;
if (h.elevation && h.elevation !== 'flat') line += ` ${h.elevation === 'uphill' ? '打ち上げ' : '打ち下ろし'}`;
if (h.hazard) line += ` ハザード:${h.hazard}`;
if (h.ob) line += ` OB:${h.ob}`;
if (h.description) line += ` — ${h.description}`;
```

#### API Route の変更

`/api/advice/stream` に `slopeFB`, `slopeLR` パラメータを追加して `createUserPrompt()` に渡す。

#### APIバリデーションの追加（照査指摘 #8）

`/api/advice/stream/route.ts` にサーバー側 enum 検証を追加:

```typescript
const VALID_SHOT_TYPES = ['ティーショット', 'セカンド', 'アプローチ', 'パット'];
const VALID_LIES = ['ティーアップ', 'フェアウェイ', 'ラフ', 'バンカー', '林'];
const VALID_SLOPE_FB = ['toe_up', 'toe_down', null];
const VALID_SLOPE_LR = ['left_up', 'left_down', null];

// バリデーション
if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) return error;
if (!VALID_SHOT_TYPES.includes(shotType)) return error;
if (!VALID_LIES.includes(lie)) return error;
if (slopeFB !== null && !VALID_SLOPE_FB.includes(slopeFB)) return error;
if (slopeLR !== null && !VALID_SLOPE_LR.includes(slopeLR)) return error;
```

### 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/features/advice/types.ts` | Situation型に `slopeFB`, `slopeLR` 追加 |
| `src/features/advice/components/advice-client.tsx` | Props に scores 追加、初期ホール自動算出 |
| `src/features/advice/components/situation-input.tsx` | ライ選択肢変更、傾斜UI追加、slopeFB/slopeLR state追加 |
| `src/features/advice/lib/prompt-template.ts` | `createUserPrompt()` に傾斜情報追加 |
| `src/features/advice/lib/context-builder.ts` | holes の select 拡張、ホール情報フォーマット拡張 |
| `src/app/play/[roundId]/advice/page.tsx` | scores データを取得して AdviceClient に渡す |
| `src/app/api/advice/stream/route.ts` | リクエストボディに slopeFB/slopeLR 追加 |

---

## 実装順序（照査指摘 #2 対応）

タスク間に以下の依存関係があるため、実装順序を固定する:

```
Phase 1: DB マイグレーション
  Task1 (holes 8カラム追加: 00004_add_hole_details.sql)
  Task2 (scores 5カラム追加: 00005_add_score_details.sql)
  ※ 両マイグレーションは独立しているため並行可能

Phase 2: 各タスク実装
  Task1 実装 → Task4 実装（context-builder が Task1 の新カラムに依存）
  Task2 実装 → Task3 実装（両方が upsertScore() を変更。Task2 で新カラム追加後に Task3 で編集フロー追加）
```

**upsertScore() の統合方針**: Task2 で新カラム（tee_shot_lr 等）追加と Par3 FW制御を実装。Task3 で同じ関数にステータスチェック緩和・total_score 再計算・revalidatePath 拡張を追加。Task3 は Task2 の変更をベースに差分追加する形で実装する。

---

## STORY-019〜023 検証結果（参考）

| Story | 内容 | 状態 | 確認内容 |
|-------|------|------|---------|
| STORY-019 | ショット結果詳細記録 | 実装済み | 評価ボタン（◎○△✕）、ミス種類、クラブ選択 |
| STORY-020 | 疲労・メンタル考慮の高度化 | 実装済み | 連続ボギー検知、メンタルリセット促進、終盤疲労警告 |
| STORY-021 | ナレッジベースCRUD | 実装済み | 一覧、カテゴリフィルター、新規追加フォーム |
| STORY-022 | スコア統計・グラフ（詳細版） | 実装済み | スコア推移、Par別平均、FWキープ率、パーオン率 |
| STORY-023 | ホール詳細一括インポート | 実装済み | CSV貼り付け→プレビュー→インポート |

スクリーンショット保存先:
- `docs/screenshot/story019-shot-recorder.png`
- `docs/screenshot/story020-mental-advice.png`
- `docs/screenshot/story021-knowledge-new.png`
- `docs/screenshot/story022-stats.png`
- `docs/screenshot/story023-hole-import.png`
- `docs/screenshot/story023-hole-import-done.png`
