'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { CompanionScoreEditor } from '@/features/score/components/companion-score-editor';
import type { Score, HoleInfo, CompanionWithScores } from '@/features/score/types';

interface ScorecardProps {
  roundId: string;
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

const OUT_HOLES = Array.from({ length: 9 }, (_, i) => i + 1);
const IN_HOLES = Array.from({ length: 9 }, (_, i) => i + 10);
const ALL_HOLES = [...OUT_HOLES, ...IN_HOLES];

export function Scorecard({ roundId, holes, scores, courseName, startingCourse, companionData }: ScorecardProps) {
  const [showDetail, setShowDetail] = useState(false);
  // 楽観的更新: 同伴者スコアのローカルオーバーライド
  const [companionOverrides, setCompanionOverrides] = useState<Map<string, Map<number, { strokes: number | null; putts: number | null }>>>(new Map());

  const scoreMap = useMemo(() => new Map(scores.map(s => [s.hole_number, s])), [scores]);
  const holeMap = useMemo(() => new Map(holes.map(h => [h.hole_number, h])), [holes]);

  // 同伴者スコアMap（DB値 + 楽観的更新をマージ）
  const companionScoreMap = useMemo(() => {
    const map = new Map<string, Map<number, { strokes: number | null; putts: number | null }>>();
    for (const { companion, scores: cs } of companionData) {
      const m = new Map<number, { strokes: number | null; putts: number | null }>();
      for (const s of cs) m.set(s.hole_number, { strokes: s.strokes, putts: s.putts });
      const overrides = companionOverrides.get(companion.id);
      if (overrides) {
        for (const [hole, val] of overrides) m.set(hole, val);
      }
      map.set(companion.id, m);
    }
    return map;
  }, [companionData, companionOverrides]);

  // CompanionScoreEditor からの保存完了コールバック
  const handleCompanionSaved = (holeNumber: number, savedScores: Array<{ companionId: string; strokes: number | null; putts: number | null }>) => {
    setCompanionOverrides(prev => {
      const next = new Map(prev);
      for (const s of savedScores) {
        if (s.strokes === null && s.putts === null) continue;
        const m = new Map(next.get(s.companionId) ?? new Map());
        m.set(holeNumber, { strokes: s.strokes, putts: s.putts });
        next.set(s.companionId, m);
      }
      return next;
    });
  };

  const sections = startingCourse === 'in'
    ? [{ label: 'IN', holes: IN_HOLES }, { label: 'OUT', holes: OUT_HOLES }]
    : [{ label: 'OUT', holes: OUT_HOLES }, { label: 'IN', holes: IN_HOLES }];

  const companions = companionData.map(c => c.companion);

  const totalStats = useMemo(() => {
    const totalPar = ALL_HOLES.reduce((sum, h) => sum + (holeMap.get(h)?.par ?? 0), 0);
    const totalStrokes = ALL_HOLES.reduce((sum, h) => sum + (scoreMap.get(h)?.strokes ?? 0), 0);
    const totalPutts = ALL_HOLES.reduce((sum, h) => sum + (scoreMap.get(h)?.putts ?? 0), 0);
    const totalCount = ALL_HOLES.filter(h => scoreMap.has(h)).length;
    return { totalPar, totalStrokes, totalPutts, totalCount };
  }, [holeMap, scoreMap]);

  return (
    <div className="max-w-md mx-auto space-y-5">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-300 truncate flex-1">{courseName}</p>
        <button
          onClick={() => setShowDetail(prev => !prev)}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 transition-colors px-3 py-2 rounded-lg bg-gray-800 min-h-[48px]"
          aria-expanded={showDetail}
          aria-controls="scorecard-tables"
        >
          {showDetail ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showDetail ? '簡易表示' : 'パット・FW・GIRを表示'}
        </button>
      </div>

      {/* セクション（OUT/IN） */}
      {/* 同伴者スコア入力 */}
      {companionData.length > 0 && (
        <CompanionScoreEditor
          companionData={companionData}
          roundId={roundId}
          startingCourse={startingCourse}
          onSaved={handleCompanionSaved}
        />
      )}

      {sections.map(section => {
        const sectionStrokes = section.holes.reduce((sum, h) => sum + (scoreMap.get(h)?.strokes ?? 0), 0);
        const sectionPutts = section.holes.reduce((sum, h) => sum + (scoreMap.get(h)?.putts ?? 0), 0);
        const sectionPar = section.holes.reduce((sum, h) => sum + (holeMap.get(h)?.par ?? 0), 0);
        const sectionCount = section.holes.filter(h => scoreMap.has(h)).length;

        return (
          <div key={section.label} className="rounded-xl border border-gray-700 overflow-x-auto" id="scorecard-tables">
            <table className="w-full text-sm tabular-nums table-fixed" aria-label={`${section.label}スコア`}>
              <thead>
                <tr className="bg-gray-800 text-gray-400 text-xs">
                  <th scope="col" className="px-1.5 py-2 text-left font-bold w-8">{section.label}</th>
                  <th scope="col" className="px-1 py-2 text-center font-medium w-9">Par</th>
                  <th scope="col" className="px-1 py-2 text-center font-bold w-14">Score</th>
                  {showDetail && (
                    <>
                      <th scope="col" className="px-1 py-2 text-center font-medium w-10">Putt</th>
                      <th scope="col" className="px-1 py-2 text-center font-medium w-8">FW</th>
                      <th scope="col" className="px-1 py-2 text-center font-medium w-8">GIR</th>
                    </>
                  )}
                  {companions.map(c => (
                    <th scope="col" key={c.id} className="px-1 py-2 text-center font-medium w-12 truncate max-w-[48px]" title={c.name}>{c.name}</th>
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
                      <td className="px-1.5 py-2 font-bold text-gray-300">{h}</td>
                      <td className="px-1 py-2 text-center text-gray-400">{par}</td>
                      <td className={`px-1 py-2 text-center font-bold text-xl ${s ? scoreColor(s.strokes, par) : 'text-gray-500'}`}>
                        {s ? s.strokes : '-'}
                      </td>
                      {showDetail && (
                        <>
                          <td className="px-1 py-2 text-center text-gray-300">{s?.putts ?? '-'}</td>
                          <td className={`px-1 py-2 text-center ${s?.fairway_hit === true ? 'text-green-400' : s?.fairway_hit === false ? 'text-red-400' : 'text-gray-500'}`}>
                            {s?.fairway_hit === true ? '○' : s?.fairway_hit === false ? '×' : '-'}
                          </td>
                          <td className={`px-1 py-2 text-center ${s?.green_in_reg === true ? 'text-green-400' : s?.green_in_reg === false ? 'text-red-400' : 'text-gray-500'}`}>
                            {s?.green_in_reg === true ? '○' : s?.green_in_reg === false ? '×' : '-'}
                          </td>
                        </>
                      )}
                      {companions.map(c => {
                        const cs = companionScoreMap.get(c.id)?.get(h);
                        return (
                          <td key={c.id} className={`px-1 py-2 text-center font-bold ${cs?.strokes ? scoreColor(cs.strokes, par) : 'text-gray-500'}`}>
                            {cs?.strokes ?? '-'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* 小計行 */}
                <tr className="bg-gray-700/80 border-t-2 border-gray-600">
                  <td className="px-1.5 py-2.5 font-bold text-white">{section.label}</td>
                  <td className="px-1 py-2.5 text-center font-bold text-gray-300">{sectionPar}</td>
                  <td className={`px-1 py-2.5 text-center font-bold text-xl ${sectionCount > 0 ? scoreColor(sectionStrokes, sectionPar) : 'text-white'}`}>{sectionCount > 0 ? sectionStrokes : '-'}</td>
                  {showDetail && (
                    <>
                      <td className="px-1 py-2.5 text-center font-bold text-gray-300">{sectionCount > 0 ? sectionPutts : '-'}</td>
                      <td className="px-1 py-2.5 text-center text-xs text-gray-400">
                        {calcHitRate(section.holes, scoreMap, 'fairway_hit')}
                      </td>
                      <td className="px-1 py-2.5 text-center text-xs text-gray-400">
                        {calcHitRate(section.holes, scoreMap, 'green_in_reg')}
                      </td>
                    </>
                  )}
                  {companions.map(c => {
                    const csMap = companionScoreMap.get(c.id);
                    const ct = section.holes.reduce((sum, h) => sum + (csMap?.get(h)?.strokes ?? 0), 0);
                    const cc = section.holes.filter(h => csMap?.get(h)?.strokes != null).length;
                    return (
                      <td key={c.id} className="px-1 py-2.5 text-center font-bold text-gray-200">{cc > 0 ? ct : '-'}</td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}

      {/* 合計 */}
      <div className="rounded-xl border border-gray-600 bg-gray-800 overflow-x-auto">
        <table className="w-full text-sm tabular-nums table-fixed" aria-label="合計スコア">
          <thead className="sr-only">
            <tr>
              <th className="w-8" />
              <th className="w-9" />
              <th className="w-14" />
              {showDetail && (
                <>
                  <th className="w-10" />
                  <th className="w-8" />
                  <th className="w-8" />
                </>
              )}
              {companions.map(c => (
                <th key={c.id} className="w-12" />
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-1.5 py-3 font-bold text-white w-8">合計</td>
              <td className="px-1 py-3 text-center font-bold text-gray-300 w-9">{totalStats.totalPar}</td>
              <td className={`px-1 py-3 text-center font-bold text-2xl w-14 ${totalStats.totalCount > 0 ? scoreColor(totalStats.totalStrokes, totalStats.totalPar) : 'text-white'}`}>
                {totalStats.totalCount > 0 ? totalStats.totalStrokes : '-'}
              </td>
              {showDetail && (
                <>
                  <td className="px-1 py-3 text-center font-bold text-gray-300 w-10">{totalStats.totalCount > 0 ? totalStats.totalPutts : '-'}</td>
                  <td className="px-1 py-3 text-center text-xs text-gray-400 w-8">
                    {calcHitRate(ALL_HOLES, scoreMap, 'fairway_hit')}
                  </td>
                  <td className="px-1 py-3 text-center text-xs text-gray-400 w-8">
                    {calcHitRate(ALL_HOLES, scoreMap, 'green_in_reg')}
                  </td>
                </>
              )}
              {companions.map(c => {
                const csMap = companionScoreMap.get(c.id);
                const ct = ALL_HOLES.reduce((sum, h) => sum + (csMap?.get(h)?.strokes ?? 0), 0);
                const cc = ALL_HOLES.filter(h => csMap?.get(h)?.strokes != null).length;
                return (
                  <td key={c.id} className="px-1 py-3 text-center font-bold text-gray-200">{cc > 0 ? ct : '-'}</td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* BottomNav高さ(~80px) + safe area分のスペーサー */}
      <div className="h-28" />
    </div>
  );
}
