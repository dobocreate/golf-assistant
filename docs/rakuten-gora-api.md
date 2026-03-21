# 楽天GORA API 連携ガイド

**最終更新:** 2026-03-21

---

## 概要

Golf Assistant では楽天GORA APIを使用してゴルフ場情報を検索・取得する。

---

## アカウント設定

### 1. アプリ登録

[楽天ウェブサービス](https://webservice.rakuten.co.jp/) にログインし、アプリを新規作成する。

| 項目 | 入力内容 |
|------|---------|
| アプリケーション名 | Golf Assistant |
| アプリケーションURL | https://golf-assistant.vercel.app |
| 許可されたWebサイト | golf-assistant.vercel.app |
| データ利用の目的 | ゴルフ場情報の検索・表示 |
| 予測QPS | 1 |

**注意:**
- 「許可されたWebサイト」にはプロトコル（`https://`）を含めない
- `localhost` は登録できない場合がある（本番ドメインのみで登録）

### 2. 認証情報

アプリ作成後、以下の2つのキーが発行される:

| キー | 形式 | 用途 |
|------|------|------|
| **アプリケーションID** | UUID（`775427c0-...`） | `applicationId` パラメータ |
| **アクセスキー** | `pk_` プレフィックス付き文字列 | `accessKey` パラメータ |

**両方が必須。** どちらか一方だけではAPIが `403` を返す。

---

## 環境変数

### ローカル開発（`.env.local`）

```
NEXT_PUBLIC_RAKUTEN_APP_ID=your-application-id
NEXT_PUBLIC_RAKUTEN_ACCESS_KEY=your-access-key
```

`NEXT_PUBLIC_` プレフィックスが必要（クライアントサイドで使用するため）。

### Vercel

```bash
# 重要: echo ではなく printf を使用（末尾改行防止）
printf "your-application-id" | vercel env add NEXT_PUBLIC_RAKUTEN_APP_ID production
printf "your-access-key" | vercel env add NEXT_PUBLIC_RAKUTEN_ACCESS_KEY production
```

`NEXT_PUBLIC_` 変数はビルド時に埋め込まれるため、追加後に **Redeploy** が必要。

環境変数追加後は **Redeploy** が必要（既存デプロイには反映されない）。

---

## API仕様

### エンドポイント

| API | URL |
|-----|-----|
| コース検索 | `https://openapi.rakuten.co.jp/engine/api/Gora/GoraGolfCourseSearch/20170623` |
| コース詳細 | `https://openapi.rakuten.co.jp/engine/api/Gora/GoraGolfCourseDetail/20170623` |

**旧エンドポイント（使用不可）:** `https://app.rakuten.co.jp/services/api/Gora/...`

### 必須パラメータ

| パラメータ | 説明 |
|-----------|------|
| `applicationId` | アプリケーションID |
| `accessKey` | アクセスキー |
| `format` | `json` |
| `keyword` / `areaCode` / `latitude+longitude` | 検索条件（いずれか1つ以上） |

### 必須ヘッダー

| ヘッダー | 値 | 理由 |
|---------|-----|------|
| `Origin` | `https://golf-assistant.vercel.app` | リファラーチェック対応 |
| `Referer` | `https://golf-assistant.vercel.app` | 同上 |

**リファラーチェック:** 楽天APIは「許可されたWebサイト」に登録されたドメインからのリクエストのみ受け付ける。ヘッダーがない場合 `403 REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING` エラーが返る。

### レスポンス例（コース検索）

```json
{
  "count": 424,
  "page": 1,
  "hits": 3,
  "Items": [
    {
      "Item": {
        "golfCourseId": 80004,
        "golfCourseName": "アジア取手カントリー倶楽部",
        "golfCourseAbbr": "アジア取手CC",
        "address": "茨城県取手市稲1340",
        "latitude": 35.9061664,
        "longitude": 140.0397556,
        "highway": "常磐自動車道谷和原",
        "golfCourseImageUrl": "https://gora.golf.rakuten.co.jp/img/golf/80004/photo1.jpg",
        "evaluation": 3.7
      }
    }
  ]
}
```

### 制限事項

- **ホール別詳細データ:** 楽天GORA APIはホール別のPar・距離・レイアウト情報を返さない。ホール情報はアプリ内で手動入力する。
- **レート制限:** 予測QPSで申告した値に基づく。過剰リクエストは `429` エラー。
- **画像ドメイン:** コース画像は `gora.golf.rakuten.co.jp` から配信される。`next.config.ts` の `remotePatterns` に `*.rakuten.co.jp` を登録済み。

---

## アプリ内の実装

### ファイル構成

| ファイル | 役割 |
|---------|------|
| `src/lib/course-source/types.ts` | `CourseSource` インターフェース定義 |
| `src/lib/course-source/rakuten-gora.ts` | 楽天GORA 具象実装 |
| `src/lib/env.ts` | 環境変数管理（`RAKUTEN_APP_ID`, `RAKUTEN_ACCESS_KEY`） |
| `src/app/api/courses/search/route.ts` | API Route（検索プロキシ、認証チェック付き） |
| `src/actions/course.ts` | Server Actions（保存、詳細取得） |

### データフロー

```
ブラウザ（検索UI）
  → GET /api/courses/search?q=xxx（API Route）
    → 認証チェック（Supabase Auth）
    → 楽天GORA API 呼び出し（サーバーサイド）
    → 検索結果を返却

ブラウザ（保存ボタン）
  → saveCourseFromGora（Server Action）
    → 楽天GORA API 詳細取得
    → courses テーブルに INSERT
    → コース詳細ページにリダイレクト
```

### APIキーの安全性

- 楽天の新APIキー（`pk_`プレフィックス）は**ブラウザからのリクエストのみ許可**する仕様
- サーバーサイド（Vercel Serverless Function等）からの呼び出しは `403 Invalid Access Key` で拒否される
- そのため、コース検索はクライアントサイドから直接楽天APIを呼び出す方式を採用
- `NEXT_PUBLIC_` プレフィックス付きでクライアントに公開するが、楽天側の「許可されたWebサイト」設定でドメイン制限済み
- コース保存（DB書き込み）は Server Action 経由で認証チェック付きで実行

---

## トラブルシューティング

| エラー | 原因 | 対策 |
|--------|------|------|
| `specify valid applicationId` | 旧エンドポイント使用、またはアプリID不正 | エンドポイントURLが `openapi.rakuten.co.jp` であることを確認 |
| `403 REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING` | Origin/Refererヘッダー欠落 | fetch呼び出しにヘッダーを追加 |
| `403` （その他） | 許可されたWebサイトにドメイン未登録 | 楽天管理画面で登録を確認 |
| `403 Invalid Access Key` | サーバーサイドからの呼び出し | 楽天の新APIキーはブラウザからのみ許可。クライアントサイド呼び出しに変更 |
| `該当するコースが見つかりませんでした` | 検索キーワードが一致しない、またはAPI設定不備 | 環境変数とAPIキーを確認 |
| Vercelで動作しない | 環境変数未反映 | Redeploy（Build Cacheなし）を実行 |
| 環境変数に `%0A` が混入 | `echo` コマンドの末尾改行 | `printf` を使用: `printf "value" \| vercel env add NAME production` |
