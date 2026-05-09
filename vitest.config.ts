import { defineConfig, configDefaults } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // configDefaults.exclude (= **/node_modules/** + **/.git/** glob) にプロジェクト固有のディレクトリを追加
    // 直接 exclude を指定すると vitest のデフォルト除外を失うため
    exclude: [...configDefaults.exclude, '.next', '.claude'],
    // pool を threads に固定。Vitest 4 のデフォルト forks pool は一部のサンドボックス
    // 環境（CI / Codex sandbox 等）で ENOENT エラーを起こすため、環境非依存にする
    pool: 'threads',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
