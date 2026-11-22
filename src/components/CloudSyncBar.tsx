import { useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertCircle,
  Check,
  Cloud,
  Copy,
  Download,
  ExternalLink,
  HelpCircle,
  LogOut,
} from 'lucide-react';
import { FIREBASE_PROJECT_ID } from '../lib/firebaseAuth';
import type { PigBatch } from '../types/population';

const CSV_HEADERS = [
  'ID_Kandang',
  'Nama_Kandang',
  'Ras',
  'Fase',
  'Jumlah_Ekor',
  'Bobot_Rata_Kg',
  'Status_Kesehatan',
  'Catatan',
  'Diperbarui_Pada',
  'Diperbarui_Oleh',
];

interface CloudSyncBarProps {
  batches: PigBatch[];
  user: User | null;
  authBusy: boolean;
  unauthorizedDomain: string | null;
  onDismissUnauthorizedDomain: () => void;
  onSignIn: () => Promise<void>;
  onOpenAuthHelp: () => void;
  onSignOut: () => Promise<void>;
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function CloudSyncBar({
  batches,
  user,
  authBusy,
  unauthorizedDomain,
  onDismissUnauthorizedDomain,
  onSignIn,
  onOpenAuthHelp,
  onSignOut,
}: CloudSyncBarProps) {
  const [copiedDomain, setCopiedDomain] = useState(false);

  const handleCopyDomain = async () => {
    if (!unauthorizedDomain) return;
    try {
      await navigator.clipboard.writeText(unauthorizedDomain);
      setCopiedDomain(true);
      window.setTimeout(() => setCopiedDomain(false), 2500);
    } catch {
      // ignore
    }
  };

  const handleDownloadCsv = () => {
    const rows = [
      CSV_HEADERS,
      ...batches.map((b) => [
        b.id,
        b.penName,
        b.breed,
        b.phase,
        b.count,
        b.avgWeightKg,
        b.healthStatus,
        b.notes,
        b.updatedAt,
        b.updatedBy,
      ]),
    ];
    const csvContent =
      '\uFEFF' + rows.map((r) => r.map(escapeCsvCell).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `populasi-babi-bhumi-swana-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-6 border border-slate-200 rounded-xl bg-[#F8F9FA] p-4 sm:p-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Cloud className="w-5 h-5 text-[#164E38] mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              {user
                ? 'Sinkronisasi Cloud Firebase Lintas Perangkat Aktif'
                : 'Sinkronisasi Real-Time Lintas Perangkat via Firebase'}
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              {user
                ? 'Seluruh penambahan, pengurangan, dan pengeditan angka populasi langsung tersimpan di Firebase Firestore dan otomatis sama di semua perangkat.'
                : 'Masuk dengan akun Google di setiap perangkat (HP, tablet, atau laptop) agar semua tim membaca dan memperbarui angka populasi yang sama secara real-time.'}
            </p>
          </div>
        </div>

        {/* Auth + CSV export controls */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenAuthHelp}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
            <span>Panduan Verifikasi</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Unduh CSV</span>
          </button>

          {!user ? (
            <button
              type="button"
              disabled={authBusy}
              onClick={onSignIn}
              className="inline-flex items-center gap-2.5 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-800 shadow-xs transition-colors disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
              </svg>
              <span>{authBusy ? 'Menghubungkan...' : 'Masuk dengan Google'}</span>
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs text-slate-600 truncate max-w-52">
                Terhubung:{' '}
                <strong className="text-slate-900">
                  {user.email || user.displayName || 'Akun Google Aktif'}
                </strong>
              </span>
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Keluar</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Clear, actionable guidance when Firebase Authorized Domains needs the preview hostname */}
      {unauthorizedDomain && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" aria-hidden="true" />
              <div className="space-y-2">
                <p className="font-semibold">
                  Domain pratinjau belum diizinkan di Firebase Authentication
                </p>
                <p className="text-amber-900 leading-relaxed">
                  Agar tombol <strong>Masuk dengan Google</strong> diizinkan oleh Google pada alamat
                  ini, tambahkan domain berikut ke{' '}
                  <strong>Authentication → Settings → Authorized domains</strong> di Firebase Console:
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="px-2.5 py-1 bg-white border border-amber-200 rounded font-mono text-[11px] text-slate-900">
                    {unauthorizedDomain}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyDomain}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-amber-300 hover:bg-amber-100 rounded text-[11px] font-medium text-amber-950 cursor-pointer"
                  >
                    {copiedDomain ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-700" aria-hidden="true" />
                        <span>Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" aria-hidden="true" />
                        <span>Salin Domain</span>
                      </>
                    )}
                  </button>
                  <a
                    href={`https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/settings`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#164E38] hover:bg-[#113D2B] text-white rounded text-[11px] font-medium"
                  >
                    <span>Buka Firebase Console</span>
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onDismissUnauthorizedDomain}
              className="text-xs font-medium underline hover:no-underline shrink-0 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
