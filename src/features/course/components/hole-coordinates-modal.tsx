'use client';

import { useState } from 'react';
import { X, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { updateHoleCoordinates } from '@/actions/course';
import { parseCoordinates } from '@/lib/geo';
import type { Hole } from '@/features/course/types';

interface HoleCoordinatesModalProps {
  hole: Hole;
  onClose: () => void;
  onSaved: () => void;
}

interface ParsedCoord {
  lat: number;
  lng: number;
}

function CoordInput({
  label,
  value,
  onChange,
  parsed,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  parsed: ParsedCoord | null;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="33°56'42.9&quot;N 131°16'32.1&quot;E"
        className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
      {value && (
        <p className={`mt-1 text-xs ${parsed ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
          {parsed
            ? `✓ ${parsed.lat.toFixed(6)}, ${parsed.lng.toFixed(6)}`
            : '形式が認識できません（DMS形式またはGoogle MapsのURLを貼り付けてください）'}
        </p>
      )}
    </div>
  );
}

function formatDecimal(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null) return '';
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

export function HoleCoordinatesModal({ hole, onClose, onSaved }: HoleCoordinatesModalProps) {
  const [teeInput, setTeeInput] = useState(() => formatDecimal(hole.tee_lat, hole.tee_lng));
  const [greenInput, setGreenInput] = useState(() => formatDecimal(hole.green_lat, hole.green_lng));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teeCoord = teeInput ? parseCoordinates(teeInput) : null;
  const greenCoord = greenInput ? parseCoordinates(greenInput) : null;

  const teeChanged = teeInput !== formatDecimal(hole.tee_lat, hole.tee_lng);
  const greenChanged = greenInput !== formatDecimal(hole.green_lat, hole.green_lng);
  const hasChanges = teeChanged || greenChanged;
  const isValid =
    (teeInput === '' || teeCoord !== null) &&
    (greenInput === '' || greenCoord !== null) &&
    hasChanges;

  async function handleSave() {
    if (!isValid) return;
    setLoading(true);
    setError(null);

    const result = await updateHoleCoordinates(
      hole.id,
      teeInput && teeCoord ? teeCoord : null,
      greenInput && greenCoord ? greenCoord : null,
    );

    if (result.error) {
      setError(result.error);
    } else {
      onSaved();
    }
    setLoading(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white dark:bg-gray-900 shadow-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">
              {hole.hole_number}番ホール — GPS座標を登録
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            aria-label="閉じる"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          Google Mapsで場所を右クリック →「座標をコピー」して貼り付けてください。
          通常のMapsのURLも対応しています（短縮URL maps.app.goo.gl は非対応）。
        </p>

        <div className="space-y-3">
          <CoordInput
            label="ティーグラウンド（任意）"
            value={teeInput}
            onChange={setTeeInput}
            parsed={teeCoord}
          />
          <CoordInput
            label="グリーン中央（残り距離表示に使用）"
            value={greenInput}
            onChange={setGreenInput}
            parsed={greenCoord}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            onClick={handleSave}
            disabled={!isValid || loading}
            isLoading={loading}
            className="flex-1"
          >
            保存
          </Button>
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
        </div>
      </div>
    </div>
  );
}
