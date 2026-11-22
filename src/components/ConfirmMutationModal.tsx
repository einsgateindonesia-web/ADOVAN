import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export interface PendingSheetConfirmation {
  title: string;
  description: string;
  confirmLabel: string;
  isDestructive?: boolean;
  onConfirm: () => Promise<void>;
  onCancel?: () => void;
}

interface ConfirmMutationModalProps {
  pending: PendingSheetConfirmation | null;
  busy: boolean;
  onCancel: () => void;
  onProceed: () => void;
}

export function ConfirmMutationModal({
  pending,
  busy,
  onCancel,
  onProceed,
}: ConfirmMutationModalProps) {
  useEffect(() => {
    if (!pending) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [pending, busy, onCancel]);

  if (!pending) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-sheet-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <AlertTriangle
              className={`w-5 h-5 shrink-0 ${
                pending.isDestructive ? 'text-red-600' : 'text-[#164E38]'
              }`}
              aria-hidden="true"
            />
            <h3 id="confirm-sheet-title" className="text-base font-semibold text-slate-900">
              {pending.title}
            </h3>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            aria-label="Tutup dialog konfirmasi"
            className="text-slate-400 hover:text-slate-700 disabled:opacity-50 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-3 text-sm text-slate-600 leading-relaxed">{pending.description}</p>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onProceed}
            className={`px-4 py-2 text-xs font-medium text-white rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap cursor-pointer ${
              pending.isDestructive
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-[#164E38] hover:bg-[#113D2B]'
            }`}
          >
            {busy ? 'Menyimpan ke Sheets...' : pending.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
