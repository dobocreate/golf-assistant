/**
 * Phase 4-C: Supabase Storage → Cloudflare R2 への画像一括コピー
 *
 * 用途: hole-thumbnails バケットの全 71 オブジェクトを R2 (golf-assistant-prod)
 *      にコピーする。完了後、Phase 4-D で hole_view_configs.object_key を更新。
 *
 * 実行: pnpm tsx scripts/migrate-storage-to-r2.ts
 *
 * アプローチ: hole-thumbnails バケットは public access なので、
 *   オブジェクト一覧は Supabase REST API (storage.list) の public 互換
 *   経路を使えないため、storage.objects テーブルを問い合わせる
 *   (このスクリプトでは事前取得した object list を使う形にしてもよい)。
 *   今回は object list を引数または stdin から渡す形にする。
 *
 * 環境変数:
 *   - NEXT_PUBLIC_SUPABASE_URL (例: https://tdbgcnoebbbbyrpsmoth.supabase.co)
 *   - R2_ACCOUNT_ID
 *   - R2_ACCESS_KEY_ID
 *   - R2_SECRET_ACCESS_KEY
 *   - R2_BUCKET_NAME (例: golf-assistant-prod)
 *
 * 入力: object 名のリストを stdin から (1 line 1 file name)
 *
 * 冪等性: R2 側に同 key が既に存在する場合は HEAD で検出して skip
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'node:fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET_NAME ?? 'golf-assistant-prod';
const SUPABASE_BUCKET = 'hole-thumbnails';

if (!SUPABASE_URL) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL');
  process.exit(1);
}
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('Missing R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY');
  process.exit(1);
}

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true, // R2: virtual-hosted style URL は対応しないため必須
});

async function objectExistsInR2(key: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch (err: unknown) {
    if (err && typeof err === 'object' && '$metadata' in err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return false;
    }
    throw err;
  }
}

async function main() {
  // stdin から object name list を読み込む
  const stdin = readFileSync(0, 'utf-8');
  const names = stdin
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (names.length === 0) {
    console.error('No object names provided via stdin');
    process.exit(1);
  }

  console.log(`Source: ${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/`);
  console.log(`Target: R2 bucket ${R2_BUCKET}`);
  console.log(`Objects to migrate: ${names.length}`);
  console.log('');

  let copied = 0;
  let skipped = 0;
  let failed = 0;

  for (const name of names) {
    const key = name;

    try {
      if (await objectExistsInR2(key)) {
        console.log(`  SKIP (already in R2): ${key}`);
        skipped++;
        continue;
      }

      const url = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${encodeURIComponent(key)}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`  FAIL (download ${res.status}): ${key}`);
        failed++;
        continue;
      }
      const arrayBuffer = await res.arrayBuffer();
      const body = new Uint8Array(arrayBuffer);
      const contentType = res.headers.get('content-type') ?? 'application/octet-stream';

      await r2.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );

      copied++;
      console.log(`  OK: ${key} (${body.length} bytes, ${contentType})`);
    } catch (err) {
      console.error(`  FAIL (upload): ${key}`, err);
      failed++;
    }
  }

  console.log('');
  console.log(`=== Migration summary ===`);
  console.log(`  copied:  ${copied}`);
  console.log(`  skipped: ${skipped}`);
  console.log(`  failed:  ${failed}`);
  console.log(`  total:   ${names.length}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
