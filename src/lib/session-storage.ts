/**
 * sessionStorage ヘルパー
 * プレー中データの画面遷移間永続化に使用
 * Map のシリアライズ/デシリアライズに対応
 */

/** sessionStorage に JSON シリアライズして保存 */
export function setSession<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value, mapReplacer));
  } catch {
    // QuotaExceeded等は無視
  }
}

/** sessionStorage から JSON デシリアライズして取得 */
export function getSession<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw, mapReviver) as T;
  } catch {
    return null;
  }
}

/** sessionStorage から削除 */
export function removeSession(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** プレフィックスに一致するキーをすべて削除 */
export function removeSessionByPrefix(prefix: string): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// --- Map シリアライズ ---

function mapReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return { __type: 'Map', entries: Array.from(value.entries()) };
  }
  return value;
}

function mapReviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && (value as Record<string, unknown>).__type === 'Map') {
    return new Map((value as { entries: [unknown, unknown][] }).entries);
  }
  return value;
}

// --- キー生成 ---

export function roundScoresKey(roundId: string): string {
  return `golf-scores-${roundId}`;
}

export function roundShotsKey(roundId: string): string {
  return `golf-shots-${roundId}`;
}

export function roundCompanionKey(roundId: string): string {
  return `golf-companions-${roundId}`;
}

export function roundDirtyKey(roundId: string): string {
  return `golf-dirty-${roundId}`;
}
