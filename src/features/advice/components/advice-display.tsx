'use client';

interface AdviceDisplayProps {
  text: string;
  isStreaming: boolean;
}

export function AdviceDisplay({ text, isStreaming }: AdviceDisplayProps) {
  if (!text && !isStreaming) return null;

  return (
    <div className="space-y-3 rounded-lg bg-gray-800 border border-gray-700 p-4">
      <h3 className="text-sm font-bold text-gray-200">AIアドバイス</h3>
      <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
        {text}
        {isStreaming && <span className="animate-pulse">▌</span>}
      </div>
    </div>
  );
}
