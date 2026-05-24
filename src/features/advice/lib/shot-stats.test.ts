import { describe, it, expect } from 'vitest';
import { formatShotStats, MIN_SAMPLE_SIZE, type ShotPatternStat } from './shot-stats';

const baseStat = (overrides: Partial<ShotPatternStat>): ShotPatternStat => ({
  lie: 'fairway',
  distance_bucket: '150-200y',
  club: '7番アイアン',
  sample_size: 8,
  success_count: 5,
  top_result: 'good',
  top_miss_type: null,
  ...overrides,
});

describe('formatShotStats', () => {
  it('空配列 → 空文字列', () => {
    expect(formatShotStats([])).toBe('');
  });

  it(`1 件 → ヘッダ + 1 行 (サンプル${MIN_SAMPLE_SIZE}件以上記載)`, () => {
    const out = formatShotStats([baseStat({})]);
    const lines = out.split('\n');
    expect(lines[0]).toContain('過去ショット傾向');
    expect(lines[0]).toContain(`サンプル${MIN_SAMPLE_SIZE}件以上`);
    expect(lines).toHaveLength(2);
  });

  it('lie が DB 値 → 日本語ラベルに変換 (fairway → フェアウェイ)', () => {
    const out = formatShotStats([baseStat({ lie: 'fairway' })]);
    expect(out).toContain('フェアウェイ');
    expect(out).not.toContain('fairway');
  });

  it('未知の lie 値 → raw 値で出力 (graceful degradation)', () => {
    const out = formatShotStats([baseStat({ lie: 'unknown_lie' })]);
    expect(out).toContain('unknown_lie');
  });

  it('成功率 >= 50% → 最頻 result (記号) を表示', () => {
    const out = formatShotStats([baseStat({ sample_size: 8, success_count: 5, top_result: 'good' })]);
    expect(out).toContain('最頻 ○');
    expect(out).not.toContain('最頻ミス');
  });

  it('成功率 < 50% かつ top_miss_type あり → 最頻ミスを優先表示', () => {
    const out = formatShotStats([
      baseStat({
        sample_size: 6,
        success_count: 2,
        top_miss_type: 'ダフリ',
        top_result: 'fair',
      }),
    ]);
    expect(out).toContain('最頻ミス ダフリ');
    expect(out).not.toContain('最頻 △');
  });

  it('成功率 < 50% だが top_miss_type 無し → 最頻 result にフォールバック', () => {
    const out = formatShotStats([
      baseStat({
        sample_size: 6,
        success_count: 2,
        top_miss_type: null,
        top_result: 'poor',
      }),
    ]);
    expect(out).toContain('最頻 ×');
  });

  it('成功率がちょうど 50% → 最頻 result 表示 (ミス優先しない)', () => {
    const out = formatShotStats([
      baseStat({
        sample_size: 6,
        success_count: 3,
        top_miss_type: 'フック',
        top_result: 'good',
      }),
    ]);
    expect(out).toContain('最頻 ○');
    expect(out).not.toContain('最頻ミス');
  });

  it('複数行 → ソート順を維持して全件出力', () => {
    const stats: ShotPatternStat[] = [
      baseStat({ club: '7番アイアン', sample_size: 8 }),
      baseStat({ club: '9番アイアン', distance_bucket: '100-150y', sample_size: 6 }),
      baseStat({ lie: 'rough', club: 'PW', distance_bucket: '50-100y', sample_size: 5, success_count: 1, top_miss_type: '右ショート' }),
    ];
    const out = formatShotStats(stats);
    const dataLines = out.split('\n').slice(1);
    expect(dataLines).toHaveLength(3);
    expect(dataLines[0]).toContain('7番アイアン');
    expect(dataLines[1]).toContain('9番アイアン');
    expect(dataLines[2]).toContain('PW');
    expect(dataLines[2]).toContain('最頻ミス 右ショート');
  });

  it('top_result が null → 結果情報なしの行になる', () => {
    const out = formatShotStats([
      baseStat({ sample_size: 4, success_count: 3, top_result: null, top_miss_type: null }),
    ]);
    expect(out).toMatch(/4回中 3回成功$/m);
    expect(out).not.toContain('最頻');
  });

  it('未知の top_result → raw 値で出力', () => {
    const out = formatShotStats([
      baseStat({ top_result: 'mystery', top_miss_type: null }),
    ]);
    expect(out).toContain('最頻 mystery');
  });

  it('行フォーマット (件数・成功数・距離バケット・クラブ)', () => {
    const out = formatShotStats([
      baseStat({
        lie: 'tee',
        distance_bucket: '250y+',
        club: '1W',
        sample_size: 4,
        success_count: 3,
        top_result: 'good',
      }),
    ]);
    // 全角括弧と半角 + の混在を避けるため toContain で分割アサート
    expect(out).toContain('ティーアップ 250y+ / 1W: 4回中 3回成功');
    expect(out).toContain('（最頻 ○）');
  });
});
