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
        // pool / client / adminPool / readPool / writePool に加え、~Pool ~Client 命名も拾う
        selector:
          "MemberExpression[object.name=/^(pool|client|adminPool|adminClient|readPool|writePool|[a-zA-Z_]+Pool|[a-zA-Z_]+Client)$/][property.name='query']",
        message:
          "Direct pool/client.query is restricted. Use db.read / db.userRead / db.transaction / db.system / adminDb.* helpers.",
      },
    ],
  },
};

const neonMigrationOverrides = {
  // Phase 1 scaffolding 用例外 (Phase 5 で `@ts-nocheck` を外す際に整理):
  //   - neon.ts: raw query を使う中央 helper
  //   - 各 route.ts / test.ts: Phase 5 で実装する scaffolding。pg/svix 未インストールのため @ts-nocheck
  // mapper/src/lib/db/neon-admin.ts は別リポジトリのため当該プロジェクト側で設定する。
  files: [
    "src/lib/db/neon.ts",
    "src/lib/db/__tests__/neon.test.ts",
    "src/app/api/diag/db-write/route.ts",
    "src/app/api/webhooks/clerk/route.ts",
  ],
  rules: {
    "no-restricted-imports": "off",
    "no-restricted-syntax": "off",
    "@typescript-eslint/ban-ts-comment": "off",
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
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
