import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const icon =
          toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-[#059669] shrink-0" />
          ) : toast.type === 'error' ? (
            <AlertCircle className="h-4 w-4 text-[#DC2626] shrink-0" />
          ) : (
            <Info className="h-4 w-4 text-[#2563EB] shrink-0" />
          );

        const borderClass =
          toast.type === 'error'
            ? 'border-[#FCA5A5] bg-[#FEF2F2]'
            : toast.type === 'success'
              ? 'border-[#A7F3D0] bg-[#FFFFFF]'
              : 'border-[#E2E8F0] bg-[#FFFFFF]';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border p-3.5 text-[13px] text-[#0F172A] shadow-[0_10px_15px_-3px_rgba(15,23,42,0.08),0_4px_6px_-4px_rgba(15,23,42,0.03)] ${borderClass}`}
          >
            <div className="mt-0.5">{icon}</div>
            <p className="flex-1 font-medium leading-[18px]">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="text-[#64748B] hover:text-[#0F172A] transition-colors p-0.5 rounded"
              aria-label="Cerrar notificación"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
