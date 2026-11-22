import { useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Check,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  LogOut,
  RefreshCw,
  Unlink,
} from 'lucide-react';
import type { SpreadsheetInfo } from '../lib/googleSheets';

interface GoogleSheetsBarProps {
  user: User | null;
  hasAccessToken: boolean;
  authBusy: boolean;
  sheetInfo: SpreadsheetInfo | null;
  sheetBusy: boolean;
  lastSheetSyncAt: string | null;
  prefilledSheetId: string;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onCreateSpreadsheet: () => Promise<void>;
  onConnectSpreadsheet: (inputUrlOrId: string) => Promise<void>;
  onChangeActiveTab: (tabName: string) => Promise<void>;
  onSyncNow: () => Promise<void>;
  onDisconnectSheet: () => void;
}

export function GoogleSheetsBar({
  user,
  hasAccessToken,
  authBusy,
  sheetInfo,
  sheetBusy,
  lastSheetSyncAt,
  prefilledSheetId,
  onSignIn,
  onSignOut,
  onCreateSpreadsheet,
  onConnectSpreadsheet,
  onChangeActiveTab,
  onSyncNow,
  onDisconnectSheet,
}: GoogleSheetsBarProps) {
  const [sheetInput, setSheetInput] = useState(prefilledSheetId);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyShareLink = async () => {
    if (!sheetInfo) return;
    const url = new URL(window.location.href);
    url.searchParams.set('sheet', sheetInfo.spreadsheetId);
    url.searchParams.set('tab', sheetInfo.activeSheetName);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  const formattedLastSync = lastSheetSyncAt
    ? new Intl.DateTimeFormat('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date(lastSheetSyncAt))
    : null;

  return (
    <div className="mt-6 border border-slate-200 rounded-xl bg-[#F8F9FA] p-4 sm:p-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="w-5 h-5 text-[#164E38] mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Sinkronisasi Google Sheets Lintas Perangkat
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Hubungkan ke satu Google Spreadsheet bersama agar HP, laptop, dan seluruh tim
              membaca serta memperbarui angka populasi yang sama secara otomatis.
            </p>
          </div>
        </div>

        {/* Auth state controls */}
        {!hasAccessToken ? (
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {prefilledSheetId && (
              <span className="text-xs text-slate-600 font-mono">
                ID Sheet Terdeteksi: {prefilledSheetId.slice(0, 12)}...
              </span>
            )}
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
              <span>{authBusy ? 'Menghubungkan...' : 'Sign in with Google'}</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-slate-600 truncate max-w-52">
              Terhubung:{' '}
              <strong className="text-slate-900">
                {user?.email || user?.displayName || 'Akun Google Aktif'}
              </strong>
            </span>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Keluar</span>
            </button>
          </div>
        )}
      </div>

      {/* Connected spreadsheet toolbar or link/create input */}
      {hasAccessToken && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          {!sheetInfo ? (
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onConnectSpreadsheet(sheetInput);
                }}
                className="flex-1 flex flex-col sm:flex-row gap-2"
              >
                <input
                  type="text"
                  value={sheetInput}
                  onChange={(e) => setSheetInput(e.target.value)}
                  placeholder="Tempel Link Google Sheets atau ID Spreadsheet..."
                  aria-label="Link atau ID Google Spreadsheet"
                  className="flex-1 px-3.5 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#164E38]/30 focus:border-[#164E38]"
                />
                <button
                  type="submit"
                  disabled={sheetBusy || !sheetInput.trim()}
                  className="px-4 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Hubungkan Spreadsheet
                </button>
              </form>

              <span className="text-xs text-slate-400 text-center hidden md:inline">atau</span>

              <button
                type="button"
                disabled={sheetBusy}
                onClick={onCreateSpreadsheet}
                className="px-4 py-2 text-xs font-medium text-white bg-[#164E38] hover:bg-[#113D2B] disabled:opacity-60 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                {sheetBusy ? 'Memproses...' : '+ Buat Spreadsheet Baru'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                <span className="font-semibold text-slate-900">{sheetInfo.title}</span>
                <span className="text-slate-300" aria-hidden="true">
                  ·
                </span>
                <label htmlFor="sheet-tab-select" className="text-slate-500">
                  Tab:
                </label>
                <select
                  id="sheet-tab-select"
                  value={sheetInfo.activeSheetName}
                  onChange={(e) => onChangeActiveTab(e.target.value)}
                  disabled={sheetBusy}
                  className="px-2 py-1 text-xs bg-white border border-slate-300 rounded-md text-slate-900"
                >
                  {sheetInfo.sheetNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                {formattedLastSync && (
                  <>
                    <span className="text-slate-300" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-slate-500 font-mono tabular-nums">
                      Sinkron {formattedLastSync} (otomatis tiap 4 dtk)
                    </span>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={sheetBusy}
                  onClick={onSyncNow}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg whitespace-nowrap cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${sheetBusy ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  <span>Sinkronkan</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyShareLink}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg whitespace-nowrap cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                      <span>Link Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Salin Link Perangkat Lain</span>
                    </>
                  )}
                </button>

                <a
                  href={`https://docs.google.com/spreadsheets/d/${sheetInfo.spreadsheetId}/edit`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#164E38] bg-white border border-[#164E38]/30 hover:bg-emerald-50 rounded-lg whitespace-nowrap"
                >
                  <span>Buka Sheets</span>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>

                <button
                  type="button"
                  onClick={onDisconnectSheet}
                  title="Putuskan koneksi spreadsheet"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-red-600 bg-white border border-slate-200 rounded-lg whitespace-nowrap cursor-pointer"
                >
                  <Unlink className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Putuskan</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
