'use client';

interface AdviceDisplayProps {
  text: string;
  isStreaming: boolean;
  error?: string | null;
}

export function AdviceDisplay({ text, isStreaming, error }: AdviceDisplayProps) {
  if (!text && !isStreaming && !error) return null;

  return (
    <div className="space-y-3 rounded-lg bg-gray-800 border border-gray-700 p-4">
      <h3 className="text-sm font-bold text-gray-200">AIアドバイス</h3>
      {text && (
        <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
          {text}
          {isStreaming && <span className="animate-pulse">▌</span>}
        </div>
      )}
      {!text && isStreaming && (
        <div className="text-sm text-gray-200">
          <span className="animate-pulse">▌</span>
        </div>
      )}
      {error && (
        <div className="text-sm text-red-300">{error}</div>
      )}
    </div>
  );
}
