'use client';

import { useState, useTransition, useCallback } from 'react';
import { Upload, Download } from 'lucide-react';
import { importHoles } from '@/actions/course';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

interface HoleImportData {
  holeNumber: number;
  par: number;
  distance: number | null;
  hdcp: number | null;
  dogleg: string | null;
  elevation: string | null;
  distanceBack: number | null;
  distanceFront: number | null;
  distanceLadies: number | null;
  hazard: string | null;
  ob: string | null;
  description: string | null;
}

interface HoleImportProps {
  courseId: string;
}

const SAMPLE_CSV = `ホール番号,Par,距離,HDCP,ドッグレッグ,高低差,バックティー,フロントティー,レディースティー,ハザード,OB,説明
1,4,380,7,right,uphill,410,340,290,"右バンカー2個",左OB,右ドッグレッグの打ち上げ
2,3,165,15,straight,downhill,185,140,120,グリーン手前バンカー,,池越えのショートホール
3,5,520,3,left,flat,550,480,430,"右池, FWバンカー",右OB,左ドッグレッグのロング`;

const DOGLEG_JP_MAP: Record<string, string> = {
  '左': 'left',
  '右': 'right',
  'ストレート': 'straight',
  '直線': 'straight',
};

const ELEVATION_JP_MAP: Record<string, string> = {
  '打ち上げ': 'uphill',
  '打ち下ろし': 'downhill',
  'フラット': 'flat',
  '平坦': 'flat',
};

const VALID_DOGLEG = new Set(['straight', 'left', 'right']);
const VALID_ELEVATION = new Set(['flat', 'uphill', 'downhill']);

/**
 * RFC4180準拠のCSVフィールドパーサ
 * ダブルクォート囲みフィールド内のカンマ・改行・エスケープに対応
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          // エスケープされたダブルクォート
          current += '"';
          i += 2;
        } else {
          // クォート終了
          inQuotes = false;
          i++;
          // クォート終了後、区切り文字まで読み飛ばす（RFC4180: 不正文字は無視）
          while (i < line.length && line[i] !== ',') {
            i++;
          }
        }
      } else {
        current += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }
  fields.push(current);
  return fields;
}

function normalizeDogleg(val: string): string | null {
  if (!val) return null;
  const lower = val.toLowerCase();
  if (VALID_DOGLEG.has(lower)) return lower;
  return DOGLEG_JP_MAP[val] ?? null;
}

function normalizeElevation(val: string): string | null {
  if (!val) return null;
  const lower = val.toLowerCase();
  if (VALID_ELEVATION.has(lower)) return lower;
  return ELEVATION_JP_MAP[val] ?? null;
}

function parseOptionalInt(val: string, min: number, max: number): { value: number | null; error: boolean } {
  if (!val) return { value: null, error: false };
  const n = parseInt(val, 10);
  if (isNaN(n) || n < min || n > max) return { value: null, error: true };
  return { value: n, error: false };
}

function parseCSV(text: string): { data: HoleImportData[]; errors: string[] } {
  const errors: string[] = [];
  const data: HoleImportData[] = [];
  const lines = text.trim().split('\n').filter(l => l.trim());

  if (lines.length === 0) {
    errors.push('データが入力されていません。');
    return { data, errors };
  }

  // ヘッダー行スキップ判定
  let startIndex = 0;
  if (lines[0].trim().startsWith('ホール番号')) {
    startIndex = 1;
  }

  if (startIndex >= lines.length) {
    errors.push('データ行がありません。');
    return { data, errors };
  }

  // 最初のデータ行のカラム数で旧形式/新形式を判定
  const firstDataFields = parseCSVLine(lines[startIndex]);
  const isNewFormat = firstDataFields.length >= 5;

  const seenHoles = new Set<number>();

  for (let i = startIndex; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i].trim();
    const parts = parseCSVLine(line);

    if (parts.length < 2) {
      errors.push(`行${lineNum}: 最低でもホール番号とParが必要です。`);
      continue;
    }

    // ホール番号
    const holeNumber = parseInt(parts[0], 10);
    if (isNaN(holeNumber) || holeNumber < 1 || holeNumber > 18) {
      errors.push(`行${lineNum}: ホール番号は1〜18で入力してください（入力値: ${parts[0]}）。`);
      continue;
    }

    if (seenHoles.has(holeNumber)) {
      errors.push(`行${lineNum}: ホール${holeNumber}が重複しています。`);
      continue;
    }
    seenHoles.add(holeNumber);

    // Par
    const par = parseInt(parts[1], 10);
    if (isNaN(par) || par < 3 || par > 5) {
      errors.push(`行${lineNum}: Parは3〜5で入力してください（入力値: ${parts[1]}）。`);
      continue;
    }

    // 距離
    const distResult = parseOptionalInt(parts[2] ?? '', 0, 700);
    if (distResult.error) {
      errors.push(`行${lineNum}: 距離は0〜700の範囲で入力してください（入力値: ${parts[2]}）。`);
      continue;
    }

    if (!isNewFormat) {
      // 旧4カラム形式: ホール番号,Par,距離,説明
      data.push({
        holeNumber,
        par,
        distance: distResult.value,
        hdcp: null,
        dogleg: null,
        elevation: null,
        distanceBack: null,
        distanceFront: null,
        distanceLadies: null,
        hazard: null,
        ob: null,
        description: parts[3] || null,
      });
      continue;
    }

    // 新12カラム形式
    let hasError = false;

    // HDCP
    const hdcpResult = parseOptionalInt(parts[3] ?? '', 1, 18);
    if (hdcpResult.error) {
      errors.push(`行${lineNum}: HDCPは1〜18で入力してください（入力値: ${parts[3]}）。`);
      hasError = true;
    }

    // ドッグレッグ
    const rawDogleg = parts[4] ?? '';
    let dogleg: string | null = null;
    if (rawDogleg) {
      dogleg = normalizeDogleg(rawDogleg);
      if (dogleg === null) {
        errors.push(`行${lineNum}: ドッグレッグは straight/left/right（または ストレート/左/右）で入力してください（入力値: ${rawDogleg}）。`);
        hasError = true;
      }
    }

    // 高低差
    const rawElevation = parts[5] ?? '';
    let elevation: string | null = null;
    if (rawElevation) {
      elevation = normalizeElevation(rawElevation);
      if (elevation === null) {
        errors.push(`行${lineNum}: 高低差は flat/uphill/downhill（または フラット/打ち上げ/打ち下ろし）で入力してください（入力値: ${rawElevation}）。`);
        hasError = true;
      }
    }

    // バックティー
    const backResult = parseOptionalInt(parts[6] ?? '', 0, 700);
    if (backResult.error) {
      errors.push(`行${lineNum}: バックティー距離は0〜700の範囲で入力してください（入力値: ${parts[6]}）。`);
      hasError = true;
    }

    // フロントティー
    const frontResult = parseOptionalInt(parts[7] ?? '', 0, 700);
    if (frontResult.error) {
      errors.push(`行${lineNum}: フロントティー距離は0〜700の範囲で入力してください（入力値: ${parts[7]}）。`);
      hasError = true;
    }

    // レディースティー
    const ladiesResult = parseOptionalInt(parts[8] ?? '', 0, 700);
    if (ladiesResult.error) {
      errors.push(`行${lineNum}: レディースティー距離は0〜700の範囲で入力してください（入力値: ${parts[8]}）。`);
      hasError = true;
    }

    if (hasError) continue;

    data.push({
      holeNumber,
      par,
      distance: distResult.value,
      hdcp: hdcpResult.value,
      dogleg,
      elevation,
      distanceBack: backResult.value,
      distanceFront: frontResult.value,
      distanceLadies: ladiesResult.value,
      hazard: parts[9] || null,
      ob: parts[10] || null,
      description: parts[11] || null,
    });
  }

  return { data, errors };
}

export function HoleImport({ courseId }: HoleImportProps) {
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<HoleImportData[] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [importResult, setImportResult] = useState<{ success?: boolean; error?: string } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showFormatHelp, setShowFormatHelp] = useState(false);

  const handlePreview = () => {
    setImportResult(null);
    const { data, errors } = parseCSV(csvText);
    setParseErrors(errors);
    if (errors.length === 0 && data.length > 0) {
      setPreview(data);
    } else {
      setPreview(null);
    }
  };

  const handleImport = () => {
    if (!preview || preview.length === 0) return;

    startTransition(async () => {
      const result = await importHoles(courseId, preview);
      if (result.error) {
        setImportResult({ error: result.error });
      } else {
        setImportResult({ success: true });
        setCsvText('');
        setPreview(null);
        setParseErrors([]);
      }
    });
  };

  const handleDownloadSample = useCallback(() => {
    const bom = '\uFEFF';
    const blob = new Blob([bom + SAMPLE_CSV], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hole-import-sample.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  // プレビューが新形式かどうか判定（hdcp以降にデータがあるか）
  const isNewFormatPreview = preview?.some(h =>
    h.hdcp !== null || h.dogleg !== null || h.elevation !== null ||
    h.distanceBack !== null || h.distanceFront !== null || h.distanceLadies !== null ||
    h.hazard !== null || h.ob !== null
  ) ?? false;

  return (
    <div className="space-y-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="text-primary font-bold"
      >
        <Upload className="h-4 w-4 mr-2" />
        ホール情報をインポート
        <span className="text-gray-500 ml-2">{isExpanded ? '▲' : '▼'}</span>
      </Button>

      {isExpanded && (
        <div className="space-y-3 bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
          <p className="text-xs text-gray-500">
            CSV形式: ホール番号,Par,距離,HDCP,ドッグレッグ,高低差,バックティー,フロントティー,レディースティー,ハザード,OB,説明
          </p>
          <p className="text-xs text-gray-400">
            ※ 旧形式（ホール番号,Par,距離,説明）にも対応しています。
          </p>

          {/* サンプルCSV */}
          <pre className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 rounded p-2 overflow-x-auto">
            {SAMPLE_CSV}
          </pre>

          {/* サンプルダウンロード + CSV様式説明 */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDownloadSample}
              className="text-primary"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              サンプルCSVをダウンロード
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFormatHelp(!showFormatHelp)}
              className="text-gray-500"
            >
              {showFormatHelp ? 'CSV様式を閉じる ▲' : 'CSV様式の説明 ▼'}
            </Button>
          </div>

          {/* CSV様式の説明（折りたたみ） */}
          {showFormatHelp && (
            <div className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 rounded p-3 space-y-1.5">
              <p className="font-bold text-gray-700 dark:text-gray-300">カラム説明（12カラム形式）</p>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b dark:border-gray-700">
                    <th className="py-1 pr-2">#</th>
                    <th className="py-1 pr-2">カラム名</th>
                    <th className="py-1 pr-2">必須</th>
                    <th className="py-1">値の説明</th>
                  </tr>
                </thead>
                <tbody className="text-gray-500 dark:text-gray-400">
                  <tr><td className="py-0.5">1</td><td>ホール番号</td><td>必須</td><td>1〜18</td></tr>
                  <tr><td className="py-0.5">2</td><td>Par</td><td>必須</td><td>3〜5</td></tr>
                  <tr><td className="py-0.5">3</td><td>距離</td><td>任意</td><td>0〜700 (yd)、レギュラーティー</td></tr>
                  <tr><td className="py-0.5">4</td><td>HDCP</td><td>任意</td><td>1〜18（難易度順位）</td></tr>
                  <tr><td className="py-0.5">5</td><td>ドッグレッグ</td><td>任意</td><td>straight / left / right（日本語: ストレート/左/右）</td></tr>
                  <tr><td className="py-0.5">6</td><td>高低差</td><td>任意</td><td>flat / uphill / downhill（日本語: フラット/打ち上げ/打ち下ろし）</td></tr>
                  <tr><td className="py-0.5">7</td><td>バックティー</td><td>任意</td><td>0〜700 (yd)</td></tr>
                  <tr><td className="py-0.5">8</td><td>フロントティー</td><td>任意</td><td>0〜700 (yd)</td></tr>
                  <tr><td className="py-0.5">9</td><td>レディースティー</td><td>任意</td><td>0〜700 (yd)</td></tr>
                  <tr><td className="py-0.5">10</td><td>ハザード</td><td>任意</td><td>自由入力（カンマ含む場合は&quot;で囲む）</td></tr>
                  <tr><td className="py-0.5">11</td><td>OB</td><td>任意</td><td>自由入力</td></tr>
                  <tr><td className="py-0.5">12</td><td>説明</td><td>任意</td><td>自由入力</td></tr>
                </tbody>
              </table>
            </div>
          )}

          <Textarea
            value={csvText}
            onChange={e => {
              setCsvText(e.target.value);
              setPreview(null);
              setImportResult(null);
            }}
            placeholder="ホールデータを貼り付けてください..."
            rows={6}
            className="text-sm"
          />

          {/* エラー表示 */}
          {parseErrors.length > 0 && (
            <div className="space-y-1">
              {parseErrors.map((err, i) => (
                <p key={i} className="text-xs text-red-500">{err}</p>
              ))}
            </div>
          )}

          {/* プレビューボタン */}
          <Button
            variant="secondary"
            onClick={handlePreview}
            disabled={!csvText.trim()}
          >
            プレビュー
          </Button>

          {/* プレビューテーブル */}
          {preview && preview.length > 0 && (
            <div className="space-y-2">
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="text-left text-gray-500 border-b dark:border-gray-700">
                      <th className="py-1 px-2">Hole</th>
                      <th className="py-1 px-2">Par</th>
                      <th className="py-1 px-2">距離</th>
                      {isNewFormatPreview && (
                        <>
                          <th className="py-1 px-2">HDCP</th>
                          <th className="py-1 px-2">DL</th>
                          <th className="py-1 px-2">高低差</th>
                          <th className="py-1 px-2">Back</th>
                          <th className="py-1 px-2">Front</th>
                          <th className="py-1 px-2">Ladies</th>
                          <th className="py-1 px-2">ハザード</th>
                          <th className="py-1 px-2">OB</th>
                        </>
                      )}
                      <th className="py-1 px-2">説明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map(h => (
                      <tr key={h.holeNumber} className="border-b dark:border-gray-800">
                        <td className="py-1 px-2">{h.holeNumber}</td>
                        <td className="py-1 px-2">{h.par}</td>
                        <td className="py-1 px-2">{h.distance ?? '-'}</td>
                        {isNewFormatPreview && (
                          <>
                            <td className="py-1 px-2">{h.hdcp ?? '-'}</td>
                            <td className="py-1 px-2">{h.dogleg ?? '-'}</td>
                            <td className="py-1 px-2">{h.elevation ?? '-'}</td>
                            <td className="py-1 px-2">{h.distanceBack ?? '-'}</td>
                            <td className="py-1 px-2">{h.distanceFront ?? '-'}</td>
                            <td className="py-1 px-2">{h.distanceLadies ?? '-'}</td>
                            <td className="py-1 px-2 text-gray-500 max-w-[120px] truncate">{h.hazard ?? '-'}</td>
                            <td className="py-1 px-2 text-gray-500">{h.ob ?? '-'}</td>
                          </>
                        )}
                        <td className="py-1 px-2 text-gray-500">{h.description ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Button
                fullWidth
                onClick={handleImport}
                isLoading={isPending}
              >
                {isPending ? 'インポート中...' : `${preview.length}ホールをインポート`}
              </Button>
            </div>
          )}

          {/* 結果表示 */}
          {importResult?.success && (
            <p className="text-sm text-green-600 dark:text-green-400">インポートが完了しました。</p>
          )}
          {importResult?.error && (
            <p className="text-sm text-red-500">{importResult.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
