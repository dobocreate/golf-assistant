'use client';

import { useState, useTransition } from 'react';
import { Upload } from 'lucide-react';
import { importHoles } from '@/actions/course';

interface HoleImportData {
  holeNumber: number;
  par: number;
  distance: number | null;
  description: string | null;
}

interface HoleImportProps {
  courseId: string;
}

const EXAMPLE_CSV = `1,4,380,右ドッグレッグ
2,3,165,池越え
3,5,520,打ち下ろし`;

function parseCSV(text: string): { data: HoleImportData[]; errors: string[] } {
  const errors: string[] = [];
  const data: HoleImportData[] = [];
  const lines = text.trim().split('\n').filter(l => l.trim());

  if (lines.length === 0) {
    errors.push('データが入力されていません。');
    return { data, errors };
  }

  const seenHoles = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const parts = line.split(',').map(p => p.trim());

    if (parts.length < 2) {
      errors.push(`行${i + 1}: 最低でもホール番号とParが必要です。`);
      continue;
    }

    const holeNumber = parseInt(parts[0], 10);
    if (isNaN(holeNumber) || holeNumber < 1 || holeNumber > 18) {
      errors.push(`行${i + 1}: ホール番号は1〜18で入力してください（入力値: ${parts[0]}）。`);
      continue;
    }

    if (seenHoles.has(holeNumber)) {
      errors.push(`行${i + 1}: ホール${holeNumber}が重複しています。`);
      continue;
    }
    seenHoles.add(holeNumber);

    const par = parseInt(parts[1], 10);
    if (isNaN(par) || par < 3 || par > 5) {
      errors.push(`行${i + 1}: Parは3〜5で入力してください（入力値: ${parts[1]}）。`);
      continue;
    }

    let distance: number | null = null;
    if (parts[2]) {
      distance = parseInt(parts[2], 10);
      if (isNaN(distance) || distance < 0 || distance > 700) {
        errors.push(`行${i + 1}: 距離は0〜700の範囲で入力してください（入力値: ${parts[2]}）。`);
        continue;
      }
    }

    const description = parts[3] || null;

    data.push({ holeNumber, par, distance, description });
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

  return (
    <div className="space-y-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm font-bold text-primary hover:underline"
      >
        <Upload className="h-4 w-4" />
        ホール情報をインポート
        <span className="text-gray-500">{isExpanded ? '▲' : '▼'}</span>
      </button>

      {isExpanded && (
        <div className="space-y-3 bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
          <p className="text-xs text-gray-500">
            CSV形式: ホール番号,Par,距離,説明
          </p>
          <pre className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 rounded p-2 overflow-x-auto">
            {EXAMPLE_CSV}
          </pre>

          <textarea
            value={csvText}
            onChange={e => {
              setCsvText(e.target.value);
              setPreview(null);
              setImportResult(null);
            }}
            placeholder="ホールデータを貼り付けてください..."
            rows={6}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-3 py-2 focus:ring-2 focus:ring-primary"
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
          <button
            onClick={handlePreview}
            disabled={!csvText.trim()}
            className="min-h-[48px] rounded-lg bg-gray-200 dark:bg-gray-700 px-4 py-2 text-sm font-bold hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            プレビュー
          </button>

          {/* プレビューテーブル */}
          {preview && preview.length > 0 && (
            <div className="space-y-2">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b dark:border-gray-700">
                      <th className="py-1 px-2">Hole</th>
                      <th className="py-1 px-2">Par</th>
                      <th className="py-1 px-2">距離</th>
                      <th className="py-1 px-2">説明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map(h => (
                      <tr key={h.holeNumber} className="border-b dark:border-gray-800">
                        <td className="py-1 px-2">{h.holeNumber}</td>
                        <td className="py-1 px-2">{h.par}</td>
                        <td className="py-1 px-2">{h.distance ?? '-'}</td>
                        <td className="py-1 px-2 text-gray-500">{h.description ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={handleImport}
                disabled={isPending}
                className="min-h-[48px] w-full rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isPending ? 'インポート中...' : `${preview.length}ホールをインポート`}
              </button>
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
