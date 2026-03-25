'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Score, HoleInfo, CompanionWithScores } from '@/features/score/types';

interface ScorecardProps {
  holes: HoleInfo[];
  scores: Score[];
  courseName: string;
  startingCourse: 'out' | 'in';
  companionData: CompanionWithScores[];
}

function scoreColor(strokes: number, par: number): string {
  const diff = strokes - par;
  if (diff < 0) return 'text-blue-400';
  if (diff === 0) return 'text-green-400';
  return 'text-red-400';
}

function calcHitRate(targetHoles: number[], scoreMap: Map<number, Score>, stat: 'fairway_hit' | 'green_in_reg'): string {
  const total = targetHoles.filter(h => scoreMap.get(h)?.[stat] != null).length;
  const hits = targetHoles.filter(h => scoreMap.get(h)?.[stat] === true).length;
  return total > 0 ? `${hits}/${total}` : '-';
}

function scoreBg(strokes: number, par: number): string {
  const diff = strokes - par;
  if (diff <= -2) return 'bg-yellow-900/30';
  if (diff < 0) return 'bg-blue-900/20';
  if (diff === 0) return '';
  if (diff === 1) return 'bg-red-900/10';
  return 'bg-red-900/20';
}

export function Scorecard({ holes, scores, courseName, startingCourse, companionData }: ScorecardProps) {
  const [showDetail, setShowDetail] = useState(false);

  const scoreMap = new Map(scores.map(s => [s.hole_number, s]));
  const holeMap = new Map(holes.map(h => [h.hole_number, h]));

  const companionScoreMap = new Map<string, Map<number, { strokes: number | null; putts: number | null }>>();
  for (const { companion, scores: cs } of companionData) {
    const m = new Map<number, { strokes: number | null; putts: number | null }>();
    for (const s of cs) m.set(s.hole_number, { strokes: s.strokes, putts: s.putts });
    companionScoreMap.set(companion.id, m);
  }

  const outHoles = Array.from({ length: 9 }, (_, i) => i + 1);
  const inHoles = Array.from({ length: 9 }, (_, i) => i + 10);
  const sections = startingCourse === 'in'
    ? [{ label: 'IN', holes: inHoles }, { label: 'OUT', holes: outHoles }]
    : [{ label: 'OUT', holes: outHoles }, { label: 'IN', holes: inHoles }];

  const totalStrokes = scores.reduce((sum, s) => sum + s.strokes, 0);
  const totalPutts = scores.reduce((sum, s) => sum + (s.putts ?? 0), 0);
  const totalPar = scores.reduce((sum, s) => sum + (holeMap.get(s.hole_number)?.par ?? 0), 0);

  const companions = companionData.map(c => c.companion);

  return (
    <div className="max-w-md mx-auto space-y-3">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-300 truncate flex-1">{courseName}</p>
        <button
          onClick={() => setShowDetail(prev => !prev)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors px-2 py-1 rounded-lg bg-gray-800"
        >
          {showDetail ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showDetail ? '簡易表示' : '詳細表示'}
        </button>
      </div>

      {/* セクション（OUT/IN） */}
      {sections.map(section => {
        const sectionStrokes = section.holes.reduce((sum, h) => sum + (scoreMap.get(h)?.strokes ?? 0), 0);
        const sectionPutts = section.holes.reduce((sum, h) => sum + (scoreMap.get(h)?.putts ?? 0), 0);
        const sectionPar = section.holes.reduce((sum, h) => sum + (holeMap.get(h)?.par ?? 0), 0);
        const sectionCount = section.holes.filter(h => scoreMap.has(h)).length;

        return (
          <div key={section.label} className="rounded-lg border border-gray-700 overflow-hidden">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="bg-gray-800 text-gray-400 text-xs">
                  <th className="px-2 py-2 text-left font-bold">{section.label}</th>
                  <th className="px-1 py-2 text-center font-medium w-10">Par</th>
                  <th className="px-1 py-2 text-center font-bold w-12">Score</th>
                  {showDetail && (
                    <>
                      <th className="px-1 py-2 text-center font-medium w-10">Putt</th>
                      <th className="px-1 py-2 text-center font-medium w-8">FW</th>
                      <th className="px-1 py-2 text-center font-medium w-8">GIR</th>
                    </>
                  )}
                  {companions.map(c => (
                    <th key={c.id} className="px-1 py-2 text-center font-medium w-12 truncate max-w-[48px]">{c.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {section.holes.map(h => {
                  const s = scoreMap.get(h);
                  const hole = holeMap.get(h);
                  const par = hole?.par ?? 4;

                  return (
                    <tr key={h} className={`bg-gray-900 ${s ? scoreBg(s.strokes, par) : ''}`}>
                      <td className="px-2 py-2 font-bold text-gray-300">{h}</td>
                      <td className="px-1 py-2 text-center text-gray-400">{par}</td>
                      <td className={`px-1 py-2 text-center font-bold ${s ? scoreColor(s.strokes, par) : 'text-gray-600'}`}>
                        {s ? s.strokes : '-'}
                      </td>
                      {showDetail && (
                        <>
                          <td className="px-1 py-2 text-center text-gray-300">{s?.putts ?? '-'}</td>
                          <td className={`px-1 py-2 text-center ${s?.fairway_hit === true ? 'text-green-400' : s?.fairway_hit === false ? 'text-red-400' : 'text-gray-600'}`}>
                            {s?.fairway_hit === true ? '○' : s?.fairway_hit === false ? '×' : '-'}
                          </td>
                          <td className={`px-1 py-2 text-center ${s?.green_in_reg === true ? 'text-green-400' : s?.green_in_reg === false ? 'text-red-400' : 'text-gray-600'}`}>
                            {s?.green_in_reg === true ? '○' : s?.green_in_reg === false ? '×' : '-'}
                          </td>
                        </>
                      )}
                      {companions.map(c => {
                        const cs = companionScoreMap.get(c.id)?.get(h);
                        return (
                          <td key={c.id} className={`px-1 py-2 text-center font-bold ${cs?.strokes ? scoreColor(cs.strokes, par) : 'text-gray-600'}`}>
                            {cs?.strokes ?? '-'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* 小計行 */}
                <tr className="bg-gray-800">
                  <td className="px-2 py-2 font-bold text-white">{section.label}</td>
                  <td className="px-1 py-2 text-center font-bold text-gray-400">{sectionPar}</td>
                  <td className="px-1 py-2 text-center font-bold text-white">{sectionCount > 0 ? sectionStrokes : '-'}</td>
                  {showDetail && (
                    <>
                      <td className="px-1 py-2 text-center font-bold text-gray-300">{sectionCount > 0 ? sectionPutts : '-'}</td>
                      <td className="px-1 py-2 text-center text-xs text-gray-400">
                        {calcHitRate(section.holes, scoreMap, 'fairway_hit')}
                      </td>
                      <td className="px-1 py-2 text-center text-xs text-gray-400">
                        {calcHitRate(section.holes, scoreMap, 'green_in_reg')}
                      </td>
                    </>
                  )}
                  {companions.map(c => {
                    const csMap = companionScoreMap.get(c.id);
                    const ct = section.holes.reduce((sum, h) => sum + (csMap?.get(h)?.strokes ?? 0), 0);
                    const cc = section.holes.filter(h => csMap?.get(h)?.strokes != null).length;
                    return (
                      <td key={c.id} className="px-1 py-2 text-center font-bold text-gray-300">{cc > 0 ? ct : '-'}</td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}

      {/* トータル */}
      <div className="rounded-lg bg-gray-800 border border-gray-700 p-3">
        <div className="grid grid-cols-3 divide-x divide-gray-700 text-center">
          <div>
            <p className="text-xs text-gray-400 mb-1">トータル</p>
            <p className="text-2xl font-bold tabular-nums">{totalStrokes || '-'}</p>
            {totalPar > 0 && (
              <p className={`text-sm font-bold ${totalStrokes - totalPar > 0 ? 'text-red-400' : totalStrokes - totalPar < 0 ? 'text-blue-400' : 'text-green-400'}`}>
                {totalStrokes - totalPar > 0 ? '+' : ''}{totalStrokes - totalPar === 0 ? 'E' : totalStrokes - totalPar}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">パット</p>
            <p className="text-2xl font-bold tabular-nums">{totalPutts || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">入力</p>
            <p className="text-2xl font-bold tabular-nums">{scores.length}/18</p>
          </div>
        </div>
      </div>

      <div className="h-24" />
    </div>
  );
}
