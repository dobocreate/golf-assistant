'use client';

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

function calcHitRate(
  targetHoles: number[],
  scoreMap: Map<number, Score>,
  stat: 'fairway_hit' | 'green_in_reg',
): string {
  const total = targetHoles.filter(h => { const v = scoreMap.get(h)?.[stat]; return v !== null && v !== undefined; }).length;
  const hits = targetHoles.filter(h => scoreMap.get(h)?.[stat] === true).length;
  return total > 0 ? `${hits}/${total}` : '-';
}

export function Scorecard({ holes, scores, courseName, startingCourse, companionData }: ScorecardProps) {
  const scoreMap = new Map(scores.map(s => [s.hole_number, s]));
  const holeMap = new Map(holes.map(h => [h.hole_number, h]));

  // 同伴者スコアMap: companionId -> holeNumber -> { strokes, putts }
  const companionScoreMap = new Map<string, Map<number, { strokes: number | null; putts: number | null }>>();
  for (const { companion, scores: cs } of companionData) {
    const m = new Map<number, { strokes: number | null; putts: number | null }>();
    for (const s of cs) m.set(s.hole_number, { strokes: s.strokes, putts: s.putts });
    companionScoreMap.set(companion.id, m);
  }

  // OUT/IN のホール番号
  const outHoles = Array.from({ length: 9 }, (_, i) => i + 1);
  const inHoles = Array.from({ length: 9 }, (_, i) => i + 10);

  // INスタートなら IN → OUT の順
  const sections = startingCourse === 'in'
    ? [{ label: 'IN', holes: inHoles }, { label: 'OUT', holes: outHoles }]
    : [{ label: 'OUT', holes: outHoles }, { label: 'IN', holes: inHoles }];

  // 合計計算
  const totalStrokes = scores.reduce((sum, s) => sum + s.strokes, 0);
  const totalPutts = scores.reduce((sum, s) => sum + (s.putts ?? 0), 0);
  const totalPar = scores.reduce((sum, s) => sum + (holeMap.get(s.hole_number)?.par ?? 0), 0);

  return (
    <div className="max-w-md mx-auto space-y-4">
      <p className="text-sm text-gray-300 truncate">{courseName}</p>

      {sections.map(section => {
        const sectionStrokes = section.holes.reduce((sum, h) => sum + (scoreMap.get(h)?.strokes ?? 0), 0);
        const sectionPutts = section.holes.reduce((sum, h) => sum + (scoreMap.get(h)?.putts ?? 0), 0);
        const sectionPar = section.holes.reduce((sum, h) => sum + (holeMap.get(h)?.par ?? 0), 0);
        const sectionCount = section.holes.filter(h => scoreMap.has(h)).length;

        return (
          <div key={section.label} className="rounded-lg border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead>
                  <tr className="bg-gray-800 text-gray-400">
                    <th className="px-1.5 py-2 text-left font-bold sticky left-0 bg-gray-800 z-10 min-w-[40px]">{section.label}</th>
                    {section.holes.map(h => (
                      <th key={h} className="px-1 py-2 text-center font-medium min-w-[28px]">{h}</th>
                    ))}
                    <th className="px-1.5 py-2 text-center font-bold min-w-[32px]">計</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {/* Par */}
                  <tr className="bg-gray-900">
                    <td className="px-1.5 py-1.5 font-bold text-gray-400 sticky left-0 bg-gray-900 z-10">Par</td>
                    {section.holes.map(h => (
                      <td key={h} className="px-1 py-1.5 text-center text-gray-400">{holeMap.get(h)?.par ?? '-'}</td>
                    ))}
                    <td className="px-1.5 py-1.5 text-center font-bold text-gray-400">{sectionPar}</td>
                  </tr>

                  {/* 自分のスコア */}
                  <tr className="bg-gray-900">
                    <td className="px-1.5 py-1.5 font-bold text-white sticky left-0 bg-gray-900 z-10">Score</td>
                    {section.holes.map(h => {
                      const s = scoreMap.get(h);
                      const par = holeMap.get(h)?.par ?? 4;
                      return (
                        <td key={h} className={`px-1 py-1.5 text-center font-bold ${s ? scoreColor(s.strokes, par) : 'text-gray-600'}`}>
                          {s ? s.strokes : '-'}
                        </td>
                      );
                    })}
                    <td className="px-1.5 py-1.5 text-center font-bold text-white">{sectionCount > 0 ? sectionStrokes : '-'}</td>
                  </tr>

                  {/* パット */}
                  <tr className="bg-gray-900">
                    <td className="px-1.5 py-1.5 font-bold text-gray-400 sticky left-0 bg-gray-900 z-10">Putt</td>
                    {section.holes.map(h => {
                      const s = scoreMap.get(h);
                      return (
                        <td key={h} className="px-1 py-1.5 text-center text-gray-300">{s?.putts ?? '-'}</td>
                      );
                    })}
                    <td className="px-1.5 py-1.5 text-center font-bold text-gray-300">{sectionCount > 0 ? sectionPutts : '-'}</td>
                  </tr>

                  {/* FW */}
                  <tr className="bg-gray-900">
                    <td className="px-1.5 py-1.5 font-bold text-gray-400 sticky left-0 bg-gray-900 z-10">FW</td>
                    {section.holes.map(h => {
                      const s = scoreMap.get(h);
                      const val = s?.fairway_hit;
                      return (
                        <td key={h} className={`px-1 py-1.5 text-center ${val === true ? 'text-green-400' : val === false ? 'text-red-400' : 'text-gray-600'}`}>
                          {val === true ? '○' : val === false ? '×' : '-'}
                        </td>
                      );
                    })}
                    <td className="px-1.5 py-1.5 text-center text-gray-400">
                      {calcHitRate(section.holes, scoreMap, 'fairway_hit')}
                    </td>
                  </tr>

                  {/* GIR */}
                  <tr className="bg-gray-900">
                    <td className="px-1.5 py-1.5 font-bold text-gray-400 sticky left-0 bg-gray-900 z-10">GIR</td>
                    {section.holes.map(h => {
                      const s = scoreMap.get(h);
                      const val = s?.green_in_reg;
                      return (
                        <td key={h} className={`px-1 py-1.5 text-center ${val === true ? 'text-green-400' : val === false ? 'text-red-400' : 'text-gray-600'}`}>
                          {val === true ? '○' : val === false ? '×' : '-'}
                        </td>
                      );
                    })}
                    <td className="px-1.5 py-1.5 text-center text-gray-400">
                      {calcHitRate(section.holes, scoreMap, 'green_in_reg')}
                    </td>
                  </tr>

                  {/* 同伴者スコア */}
                  {companionData.map(({ companion }) => {
                    const csMap = companionScoreMap.get(companion.id);
                    const compTotal = section.holes.reduce((sum, h) => sum + (csMap?.get(h)?.strokes ?? 0), 0);
                    const compCount = section.holes.filter(h => csMap?.get(h)?.strokes != null).length;
                    return (
                      <tr key={companion.id} className="bg-gray-900">
                        <td className="px-1.5 py-1.5 font-bold text-gray-300 sticky left-0 bg-gray-900 z-10 truncate max-w-[40px]">{companion.name}</td>
                        {section.holes.map(h => {
                          const cs = csMap?.get(h);
                          const par = holeMap.get(h)?.par ?? 4;
                          return (
                            <td key={h} className={`px-1 py-1.5 text-center font-bold ${cs?.strokes ? scoreColor(cs.strokes, par) : 'text-gray-600'}`}>
                              {cs?.strokes ?? '-'}
                            </td>
                          );
                        })}
                        <td className="px-1.5 py-1.5 text-center font-bold text-gray-300">{compCount > 0 ? compTotal : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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

      {/* ナビバー分のスペーサー */}
      <div className="h-24" />
    </div>
  );
}
