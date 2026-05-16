import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";

// Phase 1 D-4 (Section 4.4 / Round 2 Major 3 / Round 7 Major 4):
// pg 直 import と raw pool/client.query を db helper 経由以外で禁止する。
// 中央 db.ts と mapper の admin.ts のみ override で例外扱い。
const neonMigrationRules = {
  files: ["src/**/*.ts", "src/**/*.tsx"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["pg"],
            message:
              "Direct pg import is forbidden. Use src/lib/db/neon.ts (db.read / db.userRead / db.transaction / db.system).",
          },
        ],
      },
    ],
    // Round 7 Major 4: raw write bypass 検出 (heuristic、AST matcher)
    // 既知の限界 (Round 7 Minor 1 参照):
    //   - 変数経由 (const q = readPool.query; q(...);) は検出不能
    //   - リネーム後の変数 (const myDb = readPool; myDb.query(...)) も漏れる場合あり
    // → ヒューリスティクスの安全弁。code review との 2 段で実効性を持たせる。
    "no-restricted-syntax": [
      "error",
      {
        // 直接 Pool 系の変数に対する .query を禁止。
        // 注意: 単に `client` を禁止すると、`db.transaction(async (client) => client.query(...))`
        //       の合法な callback parameter まで誤検出するので除外。
        //       Pool/Client サフィックス命名 (readPool / adminPool 等) のみ検出する安全弁。
        selector:
          "MemberExpression[object.name=/^(pool|adminPool|readPool|writePool|[a-zA-Z_]+Pool)$/][property.name='query']",
        message:
          "Direct pool.query is restricted. Use db.read / db.userRead / db.transaction / db.system / adminDb.* helpers.",
      },
    ],
  },
};

const neonMigrationOverrides = {
  // 中央 db.ts のみ raw query を使うため例外。
  // mapper/src/lib/db/neon-admin.ts は別リポジトリのため当該プロジェクト側で設定する。
  files: ["src/lib/db/neon.ts"],
  rules: {
    "no-restricted-imports": "off",
    "no-restricted-syntax": "off",
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettierConfig,
  neonMigrationRules,
  neonMigrationOverrides,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".agents/**",
    ".claude/**",
    ".playwright-mcp/**",
    ".serena/**",
    "_migration-backups/**",
    "screenshots/**",
    "youtube_downloads/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
