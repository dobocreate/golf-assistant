# オフラインファースト保存アーキテクチャ設計書 v3

## 変更履歴

| バージョン | 変更内容 |
|-----------|---------|
| v1 | 初版（Party Mode議論ベース） |
| v2 | 社内Adversarial Review 12件の指摘を反映 |
| v3 | Codex Review 8件の指摘 + 追加テスト6件を反映 |

### v3 での主な変更点

1. **SyncMutexを操作キューに置換** — `pending: boolean`では後続リクエストの引数が消える問題を修正
2. **dataVersionによるsyncedAt照合** — 古い同期完了で未同期データを誤って「同期済み」にしない
3. **リトライ状態機械を修正** — `getRetryable()`追加、syncing状態のlease TTL導入
4. **ショットにクライアント側stable ID導入** — リトライ時の重複挿入を防止
5. **削除操作の表現** — ホール単位のreplace API（全件入れ替え）で削除を伝播
6. **オフライン復帰をClient Shellに変更** — error.tsxではなくClient Componentで復元
7. **visibilitychange/unmountを「最適化」に格下げ** — 真の保証はIndexedDB継続保存
8. **sessionStorageマイグレーションを安全化** — サーバー最新値との比較、全データタイプ対応

## 1. 背景と目的

### 現状の課題

プレー中の保存タイミングにデータタイプ間で非対称性があり、ゴルフ場の電波状況（数ホール分の圏外）を考慮するとデータロスのリスクがある。

| 課題 | 影響度 |
|------|--------|
| スコアがホール切替時にDB保存されない（メモリ更新のみ） | 高 |
| sessionStorageはタブ寿命に依存（OSがタブをkillすると消失） | 高 |
| DB保存失敗時のリトライ機構がない | 高 |
| 画面オフ（visibilitychange）時の保存トリガーがない | 中 |
| 読み取り専用データ（ホール情報、ゲームプラン等）のオフラインキャッシュがない | 中 |
| ショット削除・同伴者スコア消去がオフライン時にサーバーに伝播しない | 中 |
| 保存ボタンのデバウンスがない | 低 |

### 設計原則

1. **IndexedDBを唯一の信頼できるローカルデータソースとする** — 同期キューは補助。真のデータはIndexedDB
2. **クラウド同期はベストエフォート** — ネットワーク不安定を前提に、失敗時はリトライ
3. **全データタイプで保存トリガーを統一** — スコア/ショット/同伴者の非対称性を解消
4. **読み書き両方をオフライン対応** — 画面表示に必要な読み取りデータもキャッシュ
5. **削除を含む全操作をオフライン表現可能にする** — tombstoneではなくホール単位replace
6. **ユーザーには保存状態を正直に表示** — 「端末に保存済み」で安心感を提供

## 2. アーキテクチャ概要

### 3層ストレージモデル

```
L1: Reactステート     （即座のUI反映、コンポーネント寿命）
L2: IndexedDB         （ローカル永続化 = 真のデータソース）
L3: Supabase DB       （クラウド永続化、ベストエフォート同期）
```

> **注:** 既存のsessionStorage（旧L2）はIndexedDBに移行後、廃止する。
> **重要:** IndexedDBが主系。同期キューはIndexedDBの未同期データをDBに送るための**補助輪**であり、キュー自体がデータを保持するわけではない。

### データ分類

| 分類 | データ | オフライン方針 |
|------|--------|---------------|
| **書き込みデータ** | スコア、ショット、同伴者スコア | IndexedDBに保存 → DB同期 |
| **読み取りデータ** | ホール情報、ゲームプラン、クラブ、コース名 | ラウンド開始時にIndexedDBにキャッシュ |
| **メタデータ** | 現在ホール番号、同期状態 | IndexedDBに保持 |

### データフロー（書き込みデータ）

```
データ変更（ユーザー入力）
  │
  ├─→ L1: Reactステート更新（即座）
  │
  ├─→ L2: IndexedDB保存（デバウンス1秒、トリガー時は即座flush）
  │     version++ をインクリメント
  │
  └─→ L3: Supabase DB同期（トリガー条件付き）
        ├─ 成功 + version一致 → syncedVersion = version（同期済み）
        ├─ 成功 + version不一致 → syncedVersionは更新しない（新しい変更あり）
        └─ 失敗 → 次回トリガーでリトライ
```

> **デバウンスの明確化:** IndexedDB書き込みは**1秒デバウンス**で実行する。
> ステッパー操作（1→2→3→4の連続変更）で不要なI/Oを発生させないため。
> ただしホール切替・保存ボタン・visibilitychangeのトリガーではデバウンスを
> 無視して即座に書き込む（flush）。

### ラウンド開始時

```
1. Supabase DBからデータ取得（Server Component）
2. Client Componentでマウント時に:
   a. IndexedDBの既存データを確認
   b. 未同期データあり → マージ（後述）
   c. 未同期なし or 初回 → サーバーデータをIndexedDBにキャッシュ
   d. 読み取りデータ（holes, gamePlans, clubs, roundMeta）もキャッシュ
3. 以降のデータソースはIndexedDB + Reactステート
```

### アプリ復帰時（クラッシュ・タブkill後）

```
ページアクセス
  │
  ├─ Server Component（サーバーサイド）:
  │   データ取得を試行（Supabase fetch）
  │   ├─ 成功 → props経由でClient Componentにデータを渡す
  │   └─ 失敗 → props.serverData = null を渡す
  │
  └─ Client Component（クライアントサイド）:
      ├─ props.serverData あり + IndexedDB未同期あり:
      │   → マージ → Reactステート反映 → DB再同期キュー追加
      ├─ props.serverData あり + IndexedDB未同期なし:
      │   → サーバーデータをそのまま使用
      └─ props.serverData なし（オフライン）:
          → IndexedDBから読み取り+書き込みデータを復元
          → オフラインモードで画面表示（Client Shell）
          → online イベントで再同期
```

> **v2からの変更:** error.tsxベースの復帰は廃止。Server Componentが失敗しても
> Client Componentが`serverData`の有無で分岐し、IndexedDBから復元する。
> これにより`notFound()`との競合を回避し、オフラインでも確実にUIを表示できる。

### Client Shell（オフライン復帰UI）

```typescript
// src/features/score/components/score-client-shell.tsx
// Server Componentからのpropsが空でも、IndexedDBから画面を復元できるクライアントシェル

export function ScoreClientShell({ serverData, roundId }: Props) {
  const [data, setData] = useState(serverData);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  useEffect(() => {
    if (data) return;  // サーバーデータあり → 通常モード

    // サーバーデータなし → IndexedDBから復元を試行
    (async () => {
      const cached = await offlineStore.loadReadData();
      const scores = await offlineStore.loadScoresLocal();
      if (cached && scores) {
        setData(buildDataFromCache(cached, scores));
        setIsOfflineMode(true);
      }
      // IndexedDBにもデータなし → 本当にデータがない（notFoundに相当）
    })();
  }, [data]);

  if (!data) return <OfflineLoadingSkeleton />;
  return <ScoreInput {...data} isOfflineMode={isOfflineMode} />;
}
```

### マージ戦略（version照合）

v2では`syncedAt`タイムスタンプで判断していたが、v3ではインクリメンタルな`version`番号で照合する。

```typescript
// 各ホールのデータにversionを付与
interface LocalScore extends Score {
  version: number;         // ローカル変更のたびにインクリメント（1, 2, 3, ...）
  syncedVersion: number;   // DB同期が成功したときのversion（0 = 未同期）
}

// 未同期判定: version > syncedVersion なら未同期データあり
function isUnsynced(local: LocalScore): boolean {
  return local.version > local.syncedVersion;
}

// マージロジック（ホール単位）
function mergeScore(local: LocalScore | undefined, server: Score | undefined): LocalScore {
  if (!local) return toLocalScore(server!, 0, 0);  // ローカルなし → サーバー採用
  if (!server) return local;                         // サーバーなし → ローカル採用
  if (isUnsynced(local)) return local;               // 未同期あり → ローカル優先
  return toLocalScore(server, local.version, local.version);  // 同期済み → サーバー採用
}
```

> **同期ACKのversion照合:** DB同期成功時、レスポンスで返ってきた`dataVersion`と
> 現在のIndexedDB上の`version`を比較する。一致すれば`syncedVersion = version`に更新。
> 不一致（同期中に新しい変更があった）なら`syncedVersion`は更新しない。
> これにより、古い同期完了が新しい未同期データを「同期済み」に誤判定することを防ぐ。

## 3. 統一保存トリガー

全データタイプ（スコア/ショット/同伴者スコア）で共通のトリガーポリシーを適用する。

| トリガー | IndexedDB | Supabase DB | 方式 | 目的 |
|---------|:---------:|:-----------:|------|------|
| **データ変更時** | デバウンス1秒 | - | 非同期 | ローカル永続化（**真の保証**） |
| **保存ボタン** | 即座（flush） | 同期 | await + 操作キュー | 明示的な確実保存 |
| **ホール切替** | 即座（flush） | 同期 | await + 操作キュー | ホール完了時の永続化 |
| **idle 5秒** | flush（未保存時） | 同期 | fire-and-forget | DB同期の機会提供 |
| **visibilitychange (hidden)** | flush（未保存時） | 同期 | keepalive fetch | **最適化**（保証ではない） |
| **unmount** | flush（未保存時） | 同期 | keepalive fetch | **最適化**（保証ではない） |
| **online復帰** | - | キュー処理 | バックグラウンド | オフライン復帰時の一括同期 |

> **v2からの変更:** visibilitychange/unmountでのDB同期は「最後の安全網」ではなく
> 「運が良ければ追加同期できる**最適化**」と位置付ける。
> 真のデータ保証はIndexedDBへのデバウンス1秒書き込み + トリガー時のflush。
> keepalive fetchが成功すればボーナス、失敗してもIndexedDBにデータは残る。

### 重複実行の防止（操作キュー）

v2のSyncMutex（`pending: boolean`）では後続リクエストの引数が消える問題があった。
v3では**操作キュー**に置き換え、各操作を引数付きで直列化する。

```typescript
// 操作キュー: 引数を保持した直列実行
type SaveOperation =
  | { type: 'holeSwitch'; prevHole: number; newHole: number }
  | { type: 'saveButton'; holeNumber: number }
  | { type: 'backgroundSave'; holeNumber: number };

class OperationQueue {
  private queue: SaveOperation[] = [];
  private running = false;
  private executor: (op: SaveOperation) => Promise<void>;

  constructor(executor: (op: SaveOperation) => Promise<void>) {
    this.executor = executor;
  }

  enqueue(op: SaveOperation): void {
    // backgroundSaveは最新1件のみ保持（古いものは意味がない）
    if (op.type === 'backgroundSave') {
      this.queue = this.queue.filter(q => q.type !== 'backgroundSave');
    }
    this.queue.push(op);
    this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const op = this.queue.shift()!;
        await this.executor(op);
      }
    } finally {
      this.running = false;
    }
  }

  get isProcessing(): boolean {
    return this.running;
  }
}
```

> **v2との違い:** `onSaveButton(5)` → `onHoleSwitch(5,6)` が連続で来ても、
> 両方の操作が引数付きでキューに入り、順次実行される。引数が消えない。

### visibilitychange / unmount の位置付け

モバイルブラウザではページがhiddenになった後、ネットワーク接続が数秒で切断される可能性がある。

```typescript
function onBackgroundSave(holeNumber: number) {
  // 1. IndexedDBへの書き込み（ローカル永続化 — これが真の保証）
  flushToIndexedDB(holeNumber);

  // 2. DB同期の試行（最適化 — 成功すればボーナス）
  const payload = buildSyncPayload(holeNumber);
  if (payload && navigator.onLine) {
    fetch('/api/sync', {
      method: 'POST',
      body: JSON.stringify(payload),
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {
      // 失敗は想定内 — IndexedDBに保存済みなので次回アクセス時に回復
    });
  }
}
```

> **keepalive制約:** body上限64KB。1ホール分のデータ（1-2KB）は問題ない。
> visibilitychange時は**現在ホールのみ**を同期対象とする。

### 新規APIエンドポイント

```typescript
// src/app/api/sync/route.ts
// POST: 1ホール分のスコア + ショット + 同伴者を一括保存
// keepalive fetch対応のため、Server Actionではなく API Route として実装
// 内部では共通のサービス関数を呼び出す（Server Actionと共有）
```

## 4. 技術設計

### 4.1 IndexedDB層

#### ライブラリ選定

`idb-keyval`（2KB gzip）を採用。理由：
- シンプルなget/set APIで十分（リレーショナルクエリ不要）
- 軽量で既存バンドルサイズへの影響が最小
- structured cloneでMap/Set/Dateをそのまま保存可能
- 同期キューの状態管理もget/set + entries走査で実現可能

> **Dexie.jsとの比較:** Codexレビューでは複雑なキュー管理にはDexieが保守しやすいと指摘された。
> しかし本設計ではキューアイテム数がラウンドあたり最大54件（18ホール×3アクション）と少量であり、
> entries走査のコストは無視できる。30KBのDexie追加よりidb-keyvalの軽量さを優先する。

#### ストア構造

```typescript
// src/lib/offline-store.ts
import { createStore, get, set, del, entries } from 'idb-keyval';

const dataStore = createStore('golf-data', 'round-data');
const syncStore = createStore('golf-sync', 'sync-queue');
```

#### キー命名規則とデータ型

```typescript
// 書き込みデータ
type WriteDataKey =
  | `scores:${string}`         // → Map<number, LocalScore>
  | `shots:${string}`          // → Map<number, LocalShot[]>
  | `companions:${string}`;    // → Map<number, HoleInputs>

// 読み取りデータ
type ReadDataKey =
  | `holes:${string}`          // → Hole[]
  | `gamePlans:${string}`      // → GamePlan[]
  | `clubs:${string}`          // → Club[]
  | `roundMeta:${string}`;     // → RoundMeta

// メタデータ
type MetaKey = `meta:${string}`;  // → { currentHole }

// === データ型 ===

interface LocalScore extends Score {
  version: number;           // ローカル変更でインクリメント
  syncedVersion: number;     // 同期成功時のversion（0 = 未同期）
}

interface LocalShot extends Shot {
  clientId: string;          // クライアント側stable ID（crypto.randomUUID()）
  version: number;
  syncedVersion: number;
}
// ※ clientIdはショット新規作成時に付与。DBのidとは独立。
// リトライ時にclientIdでupsertすることで重複挿入を防止する。
```

> **ショットのclientId:** 現行の`saveShotsForHole()`は`id`カラムのonConflictでupsertする。
> 新規ショット（idなし）を同じpayloadで再送すると重複行が生まれる。
> clientIdをDBのidとは別にペイロードに含め、サーバー側でclientIdベースの重複排除を行う。

#### IndexedDBフォールバック

IndexedDBが利用不可（プライベートモード、quota超過等）の場合：

```typescript
// IndexedDB利用可否の判定（初期化時に1回実行）
async function checkIndexedDBAvailability(): Promise<boolean> {
  try {
    const testStore = createStore('golf-test', 'test');
    await set('__test__', 1, testStore);
    await del('__test__', testStore);
    return true;
  } catch {
    return false;
  }
}

// 利用不可の場合: sessionStorageフォールバック + ユーザー通知
// 「データは一時的に保存されますが、ブラウザを閉じると消える可能性があります」
```

### 4.2 同期キュー

#### 設計方針

同期キューは**IndexedDB上の未同期データをDBに送る指示書**であり、データ本体を保持しない。
キューアイテムにはpayloadを含むが、これは「IndexedDBからデータを取り出して送る」のではなく
「enqueue時点のスナップショット」である。

#### キューアイテム構造

```typescript
interface SyncQueueItem {
  id: string;                    // crypto.randomUUID()
  action: 'replaceScoreForHole' | 'replaceShotsForHole' | 'replaceCompanionScoresForHole';
  payload: unknown;
  roundId: string;
  holeNumber: number;
  dataVersion: number;           // enqueue時点のIndexedDB version
  createdAt: number;
  retryCount: number;
  maxRetries: number;            // デフォルト: 10
  status: 'pending' | 'syncing' | 'failed';
  syncingStartedAt: number | null;  // syncing開始時刻（lease TTL用）
}
```

> **v2からの変更:**
> - action名を`replace*`に変更 — ホール単位の全件入れ替えを明示
> - `syncingStartedAt`追加 — syncing状態のlease管理用

#### キュー操作

```typescript
export const syncQueue = {
  enqueueOrReplace(item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'retryCount' | 'status' | 'syncingStartedAt'>): Promise<void>,
  // 置換ルール:
  //   pending → 最新データで上書き
  //   syncing → 新規追加（in-flightは触らない）
  //   failed  → 最新データで上書き + retryCountリセット

  // リトライ対象を取得: pending + (retryCount < maxRetries の failed)
  getRetryable(): Promise<SyncQueueItem[]>,

  // staleなsyncingアイテムを回収（lease TTL超過）
  recoverStale(ttlMs: number): Promise<number>,
  // syncingStartedAt + ttlMs < Date.now() のアイテムを pending に戻す

  markSyncing(id: string): Promise<void>,
  // status = 'syncing', syncingStartedAt = Date.now()

  markFailed(id: string): Promise<void>,
  // status = 'failed', retryCount++

  remove(id: string): Promise<void>,

  pendingCount(): Promise<number>,
  // pending + retryable failed の合計

  countByRound(roundId: string): Promise<number>,
  // 全ステータスの合計
};
```

> **v2からの修正:**
> - `getPending()` → `getRetryable()`: failed状態でもretryCount < maxRetriesなら取得対象
> - `recoverStale()`: syncing状態のまま残ったアイテム（タブクラッシュ等）をlease TTL（30秒）で回収

#### リトライ戦略

- **指数バックオフ**: 1秒 → 2秒 → 4秒 → 8秒 → ... → 最大30秒
- **最大リトライ回数**: 10回（超過後は`failed`状態で保持、手動リトライのみ）
- **重複排除**: 同じ `roundId + holeNumber + action` のアイテムは最新データで上書き
- **lease TTL**: syncing状態が30秒超のアイテムはpendingに戻す（クラッシュ回収）
- **永続失敗の区別**: 認証切れ(401)・ラウンド完了済み(404)等のHTTPエラーは即座にfailedでリトライしない

### 4.3 削除操作の表現

#### 問題

v2では`enqueueOrReplace`が「最新payloadで上書き」する前提だったが、
ショット削除やcompanionスコア消去の操作がサーバーに伝播しなかった。

#### 解決策: ホール単位のreplace API

既存の`saveShotsForHole()`（upsertベース）では削除を表現できない。
**ホール単位の全件入れ替え**（delete + insert）方式に変更する。

```typescript
// src/actions/shot.ts に追加
export async function replaceShotsForHole(data: {
  roundId: string;
  holeNumber: number;
  shots: Array<{
    clientId: string;    // クライアント側stable ID
    // ... 既存フィールド
  }>;
}): Promise<{ error?: string; shots?: Shot[] }> {
  // 1. 該当ホールの既存ショットを全削除
  // 2. 新しいショットを全件insert（clientIdはmetadataとして保存）
  // 3. これによりショット削除がサーバーに正確に反映される
}

// src/actions/companion.ts に追加
export async function replaceCompanionScoresForHole(data: {
  roundId: string;
  holeNumber: number;
  scores: Array<{ companionId: string; strokes: number | null; putts: number | null }>;
}): Promise<{ error?: string }> {
  // 1. 該当ホールの既存companionスコアを全削除
  // 2. 新しいスコアを全件insert
  // 3. strokes=null & putts=null のエントリも含めることで「未入力」を明示
}
```

> **トレードオフ:** replace方式はupsertより負荷が高いが、1ホール分のデータ量（ショット最大10件程度）
> では問題にならない。delete→insertはトランザクション内で実行し、中途半端な状態を防ぐ。

### 4.4 同期エンジン

```typescript
export function useSyncEngine(roundId: string) {
  return {
    syncOne(item: SyncQueueItem): Promise<boolean>,
    processQueue(): Promise<{ synced: number; failed: number }>,

    syncStatus: 'idle' | 'syncing' | 'offline' | 'error',
    pendingCount: number,
    isOnline: boolean,
  };
}
```

#### 同期フロー

```
processQueue()
  │
  ├─ navigator.onLine === false → return（オフライン時はスキップ）
  │
  ├─ syncQueue.recoverStale(30_000)  // 30秒超のsyncingアイテムを回収
  │
  ├─ retryable = syncQueue.getRetryable()
  │
  └─ for item of retryable:
       ├─ syncQueue.markSyncing(item.id)
       ├─ result = await executeServerAction(item.action, item.payload)
       │
       ├─ 成功:
       │   ├─ syncQueue.remove(item.id)
       │   ├─ IndexedDBのsyncedVersionを更新
       │   │   ※ item.dataVersion === 現在のversion の場合のみ
       │   │   ※ 不一致なら syncedVersion は更新しない（新しい変更がある）
       │   └─ revalidateは蓄積し、ループ後に1回だけ実行
       │
       ├─ 失敗（リトライ可能: ネットワークエラー, 5xx）:
       │   └─ syncQueue.markFailed(item.id)
       │       → retryCount < maxRetries なら次回processQueueでリトライ
       │
       └─ 失敗（永続エラー: 401, 403, 404）:
           └─ syncQueue.markFailed(item.id) + maxRetriesを0に設定
               → リトライしない。ユーザー通知。
```

#### revalidatePathの制御

- Server Actionに `skipRevalidate?: boolean` オプションを追加
- 同期エンジンからの呼び出し時は `skipRevalidate: true`
- 全アイテム処理完了後に1回だけ `/play/{roundId}/score` をrevalidate

### 4.5 保存オーケストレーター

#### コンポーネント接続方式

オーケストレーターは各コンポーネントの内部状態に直接アクセスしない。
**データ収集コールバック**と**同期ペイロードビルダー**を分離して登録する。

```typescript
// 各機能が個別に登録するコールバック
interface ScoreCallbacks {
  collectData: (hole: number) => Partial<LocalScore> | null;
  buildSyncPayload: (hole: number) => Parameters<typeof upsertScore>[0] | null;
}
interface ShotCallbacks {
  collectData: (hole: number) => LocalShot[] | null;
  buildSyncPayload: (hole: number) => Parameters<typeof replaceShotsForHole>[0] | null;
}
interface CompanionCallbacks {
  collectData: (hole: number) => HoleInputs | null;
  buildSyncPayload: (hole: number) => Parameters<typeof replaceCompanionScoresForHole>[0] | null;
}

export function useSaveOrchestrator(roundId: string) {
  const offlineStore = useOfflineStore(roundId);
  const syncEngine = useSyncEngine(roundId);
  const opQueue = useRef<OperationQueue>(null);

  return {
    // 各機能が個別に登録（stale closure対策でref経由）
    registerScoreCallbacks(cb: ScoreCallbacks): void,
    registerShotCallbacks(cb: ShotCallbacks): void,
    registerCompanionCallbacks(cb: CompanionCallbacks): void,

    // トリガー
    onHoleSwitch(prevHole: number, newHole: number): void,  // opQueueにenqueue
    onSaveButton(holeNumber: number): void,
    onBackgroundSave(holeNumber: number): void,
    onOnlineRestore(): Promise<void>,

    // 状態
    syncStatus: SyncStatus,
    pendingCount: number,
    isProcessing: boolean,  // 操作キュー実行中（ボタンdisabled用）
  };
}
```

> **v2からの変更:**
> - 単一`callbacksRef`ではなく、各機能が個別にコールバックを登録
> - stale closure対策: 各コールバックはref経由で最新値を参照
> - `onHoleSwitch`等はPromiseを返さない（操作キューにenqueueして即return）

#### 各トリガーの処理（操作キュー経由）

**holeSwitch操作:**
```
1. scoreCallbacks.collectData(prevHole) → IndexedDB書き込み（version++）
2. shotCallbacks.collectData(prevHole) → IndexedDB書き込み（version++）
3. companionCallbacks.collectData(prevHole) → IndexedDB書き込み（version++）
4. 各buildSyncPayload(prevHole) → null でなければ:
   a. DB同期を試行（await）
   b. 成功 → version一致なら syncedVersion更新
   c. 失敗 → syncQueue.enqueueOrReplace()
5. newHoleのデータをIndexedDB/Reactステートから読み込み
```

**saveButton操作:**
```
1. 全collectData(holeNumber) → IndexedDB書き込み
2. 全buildSyncPayload(holeNumber) → DB同期試行
3. 失敗 → syncQueue.enqueueOrReplace()
4. syncQueue.getRetryable().length > 0 なら processQueue()も実行
```

**backgroundSave操作:**
```
1. 全collectData(holeNumber) → IndexedDB即時書き込み（flush）
2. navigator.onLine === true の場合:
   fetch('/api/sync', { keepalive: true, ... })
   失敗しても問題なし（IndexedDBに保存済み）
```

## 5. UI変更

### 接続状態インジケーター

| 状態 | 表示 | 色 |
|------|------|----|
| オンライン＋同期済み | 表示なし | - |
| オンライン＋同期中 | 同期アイコン回転 | blue |
| **オフライン＋ローカル保存済み** | **「端末に保存済み ✓」** | **emerald** |
| オフライン＋同期待ちあり | 「○件の変更を同期待ち」 | amber |
| 同期エラー（リトライ上限超過） | 「同期に失敗しました」+ 手動リトライボタン | rose |
| **IndexedDB利用不可** | 「一時保存モード（ブラウザを閉じないでください）」 | amber |

### 保存ボタンのデバウンス

操作キュー実行中（`isProcessing === true`）はボタンをdisabled表示。

## 6. sessionStorage移行計画

### マイグレーション処理（安全版）

```typescript
async function migrateFromSessionStorage(
  roundId: string,
  serverScores: Score[],  // Server Componentから取得した最新データ
): Promise<void> {
  const idbData = await loadScoresLocal();
  if (idbData) return;  // IndexedDB移行済み

  const ssScores = getSession<Map<number, Score>>(roundScoresKey(roundId));
  if (!ssScores || ssScores.size === 0) return;  // sessionStorageにデータなし

  // サーバーデータとの比較: sessionStorageの方が新しいデータのみ移行
  const serverMap = new Map(serverScores.map(s => [s.hole_number, s]));
  const localScores = new Map<number, LocalScore>();

  for (const [hole, ssScore] of ssScores) {
    const serverScore = serverMap.get(hole);
    if (!serverScore || isDifferent(ssScore, serverScore)) {
      // サーバーと差異あり → sessionStorageのデータを未同期として移行
      localScores.set(hole, { ...ssScore, version: 1, syncedVersion: 0 });
    } else {
      // サーバーと同一 → 同期済みとして移行
      localScores.set(hole, { ...ssScore, version: 1, syncedVersion: 1 });
    }
  }

  await saveScoresLocal(localScores);

  // ショット・同伴者も同様に移行
  await migrateShotsFromSessionStorage(roundId);
  await migrateCompanionsFromSessionStorage(roundId);
}
```

> **v2からの変更:**
> - サーバーデータとの比較を追加（古いsessionStorageデータでサーバー最新値を上書きしない）
> - ショット・同伴者の移行も含める

## 7. ラウンド完了時のクリーンアップ

```typescript
async function onRoundComplete(roundId: string) {
  const count = await syncQueue.countByRound(roundId);
  if (count > 0) {
    await syncEngine.processQueue();
    const remaining = await syncQueue.countByRound(roundId);
    if (remaining > 0) {
      showWarning('未同期のデータがあります。電波の良い場所で再度お試しください。');
      return;  // クリーンアップ保留
    }
  }
  await offlineStore.clearRoundData();
}
```

## 8. 新規ファイル一覧

| ファイル | 役割 |
|---------|------|
| `src/lib/offline-store.ts` | IndexedDBラッパー（idb-keyval） |
| `src/lib/sync-queue.ts` | 同期キュー管理（lease TTL付き） |
| `src/features/score/hooks/use-offline-store.ts` | IndexedDB操作フック |
| `src/features/score/hooks/use-sync-engine.ts` | 同期エンジンフック |
| `src/features/score/hooks/use-save-orchestrator.ts` | 保存オーケストレーター（操作キュー） |
| `src/features/score/components/sync-status-indicator.tsx` | 接続状態インジケーター |
| `src/features/score/components/score-client-shell.tsx` | オフライン復帰用Client Shell |
| `src/app/api/sync/route.ts` | keepalive対応の同期API |

## 9. 既存ファイルの変更一覧

| ファイル | 変更内容 |
|---------|---------|
| `package.json` | `idb-keyval`依存追加 |
| `src/features/score/components/score-input.tsx` | useSaveOrchestrator統合、sessionStorage除去、各種トリガー追加 |
| `src/features/score/hooks/use-shot-recorder.ts` | clientId導入、保存ロジックをオーケストレーターに委譲 |
| `src/features/score/components/companion-score-editor.tsx` | 保存ロジックをオーケストレーターに委譲 |
| `src/app/play/[roundId]/score/page.tsx` | Client Shell導入、serverDataのnull許容 |
| `src/app/play/[roundId]/complete/page.tsx` | クリーンアップ処理追加 |
| `src/actions/score.ts` | `skipRevalidate`オプション追加 |
| `src/actions/shot.ts` | `replaceShotsForHole()`追加、clientIdサポート、`skipRevalidate` |
| `src/actions/companion.ts` | `replaceCompanionScoresForHole()`追加、`skipRevalidate` |
| `src/lib/session-storage.ts` | 段階的に廃止 |

## 10. 実装順序

```
Step 1: 基盤層
  ├─ pnpm add idb-keyval
  ├─ src/lib/offline-store.ts（IndexedDB可否チェック含む）
  ├─ src/lib/sync-queue.ts（lease TTL、getRetryable含む）
  └─ src/app/api/sync/route.ts

Step 2: Server Action拡張
  ├─ src/actions/shot.ts: replaceShotsForHole() + clientIdサポート
  ├─ src/actions/companion.ts: replaceCompanionScoresForHole()
  └─ 全Server Actionに skipRevalidate オプション追加

Step 3: フック層
  ├─ src/features/score/hooks/use-offline-store.ts
  ├─ src/features/score/hooks/use-sync-engine.ts
  └─ sessionStorageマイグレーション（サーバーデータ比較付き）

Step 4: オーケストレーター
  └─ src/features/score/hooks/use-save-orchestrator.ts
      ├─ OperationQueue実装
      ├─ 個別コールバック登録パターン
      └─ 全トリガー処理

Step 5: 既存コンポーネント統合
  ├─ score-input.tsx: オーケストレーター統合
  ├─ use-shot-recorder.ts: clientId導入、保存委譲
  └─ companion-score-editor.tsx: 保存委譲

Step 6: Client Shell + 読み取りデータキャッシュ
  ├─ score-client-shell.tsx 作成
  ├─ score/page.tsx: serverDataのnull許容化
  └─ 読み取りデータのIndexedDBキャッシュ

Step 7: 復帰・マージフロー
  └─ アプリ再訪問時のIndexedDB ↔ DB マージ処理（version照合）

Step 8: UI
  ├─ sync-status-indicator.tsx 作成
  └─ score-input.tsx に接続状態表示を追加

Step 9: クリーンアップ
  ├─ ラウンド完了時のIndexedDB + キュークリーンアップ
  └─ sessionStorage関連コードの削除
```

## 11. テストシナリオ

| # | シナリオ | 手順 | 期待結果 |
|---|---------|------|---------|
| 1 | 正常保存 | スコア入力→保存ボタン | IndexedDB(version++) + DB同期、syncedVersion更新 |
| 2 | ホール切替保存 | スコア入力→次ホール | 前ホールの全データがIndexedDB + DB保存 |
| 3 | オフライン継続 | 機内モードON→3ホール分入力→機内モードOFF | IndexedDB保存。復帰後DB同期。revalidate 1回 |
| 4 | 画面オフ保存 | スコア入力→画面オフ | IndexedDB flush + keepalive fetch試行（ボーナス） |
| 5 | タブkill復帰 | スコア入力→タブ強制終了→再アクセス | IndexedDBから復元、version照合でマージ、未同期分を再同期 |
| 6 | 同期リトライ | DB保存失敗→ネットワーク復帰 | getRetryable()で自動リトライ成功 |
| 7 | 保存ボタン+ホール切替競合 | 保存ボタン直後にホール切替 | 操作キューで順次実行、引数保持 |
| 8 | 長時間オフライン | 18ホール分オフライン→オンライン復帰 | 全件キュー処理、revalidate最後に1回 |
| 9 | ラウンド完了（未同期あり） | オフラインでラウンド完了 | 警告表示、クリーンアップ保留 |
| 10 | idle + visibilitychange競合 | idle 4秒経過後に画面オフ | 操作キューで順次実行 |
| 11 | マイグレーション | sessionStorageにデータ→アプデ後初回アクセス | サーバー比較付きでIndexedDBに移行 |
| 12 | オフラインページリロード | オフラインでページリロード | Client ShellがIndexedDBから復元表示 |
| 13 | **syncing中タブクラッシュ** | 同期中にタブ強制終了→再アクセス | lease TTL(30秒)でsyncingアイテム回収→pendingに戻してリトライ |
| 14 | **ショット削除** | ショット3件入力→1件削除→保存 | replaceShotsForHoleで2件がDB反映、削除された1件はDB上も消える |
| 15 | **同伴者スコア消去** | 同伴者スコア入力→消去→保存 | replaceCompanionScoresForHoleでDB上も消える |
| 16 | **複数タブ** | 同一ラウンドを2タブで開く | 後から保存した方のデータが残る（last write wins） |
| 17 | **永続失敗（認証切れ）** | 認証トークン期限切れ→同期試行 | 401エラー→即failed（リトライしない）→ユーザー通知 |
| 18 | **IndexedDB利用不可** | プライベートモードでアクセス | sessionStorageフォールバック + 「一時保存モード」表示 |
| 19 | **マイグレーション（古いデータ）** | sessionStorageにDBより古いデータ→アプデ後アクセス | サーバー最新値を採用、古いsessionStorageデータで上書きしない |
| 20 | **quota超過** | IndexedDB書き込みが容量制限に達する | エラーキャッチ→sessionStorageフォールバック→ユーザー通知 |
