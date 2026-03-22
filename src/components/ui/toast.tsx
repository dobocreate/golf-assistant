'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = nextId++;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext value={{ showToast }}>
      {children}
      {/* トースト表示エリア */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onDone={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext>
  );
}

function ToastItem({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // フェードイン
    requestAnimationFrame(() => setVisible(true));
    // 2秒後にフェードアウト
    const timer = setTimeout(() => setVisible(false), 2000);
    // フェードアウト後に削除
    const removeTimer = setTimeout(onDone, 2300);
    return () => {
      clearTimeout(timer);
      clearTimeout(removeTimer);
    };
  }, [onDone]);

  const bgColor = toast.type === 'success'
    ? 'bg-green-600'
    : toast.type === 'error'
      ? 'bg-red-600'
      : 'bg-gray-700';

  return (
    <div
      className={`pointer-events-auto px-5 py-3 rounded-lg text-sm font-bold text-white shadow-lg transition-all duration-300 ${bgColor} ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      }`}
    >
      {toast.message}
    </div>
  );
}
