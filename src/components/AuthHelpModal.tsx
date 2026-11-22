import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Globe,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';

export type AuthFailureCategory =
  | 'unauthorized-domain'
  | 'app-not-verified'
  | 'popup-blocked'
  | 'popup-closed'
  | 'user-mismatch'
  | 'generic';

export interface AuthFailureState {
  category: AuthFailureCategory;
  source: 'signin' | 'manual';
  code?: string;
  message: string;
  hostname: string;
  origin: string;
  projectId: string;
}

interface AuthHelpModalProps {
  failure: AuthFailureState | null;
  retrying?: boolean;
  onClose: () => void;
  onRetry?: () => void;
}

export function AuthHelpModal({
  failure,
  retrying = false,
  onClose,
  onRetry,
}: AuthHelpModalProps) {
  const [activeTab, setActiveTab] = useState<'domain' | 'verified'>('domain');
  const [copiedField, setCopiedField] = useState<'domain' | 'origin' | null>(null);

  useEffect(() => {
    if (!failure) return;
    if (failure.category === 'unauthorized-domain') {
      setActiveTab('domain');
    } else {
      setActiveTab('verified');
    }
  }, [failure]);

  useEffect(() => {
    if (!failure) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !retrying) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [failure, retrying, onClose]);

  if (!failure) return null;

  const copyValue = async (text: string, field: 'domain' | 'origin') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 2200);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const titleText =
    failure.category === 'unauthorized-domain'
      ? 'Verifikasi Domain Firebase Diperlukan'
      : failure.category === 'app-not-verified' || failure.category === 'popup-closed'
        ? "Panduan Mengatasi Error 'Firebase App not verified'"
        : failure.category === 'popup-blocked'
          ? 'Popup Autentikasi Diblokir Browser'
          : 'Panduan Verifikasi Domain & Autentikasi Firebase';

  const firebaseAuthSettingsUrl = `https://console.firebase.google.com/project/${failure.projectId}/authentication/settings`;
  const gcpConsentUrl = `https://console.cloud.google.com/apis/credentials/consent?project=${failure.projectId}`;
  const gcpCredentialsUrl = `https://console.cloud.google.com/apis/credentials?project=${failure.projectId}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-help-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !retrying) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 bg-[#F8F9FA] flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5 text-amber-800" aria-hidden="true" />
            </div>
            <div>
              <h3
                id="auth-help-modal-title"
                className="text-base sm:text-lg font-semibold text-slate-900"
              >
                {titleText}
              </h3>
              <p className="mt-0.5 text-xs text-slate-600">
                Ikuti langkah verifikasi Firebase berikut agar seluruh perangkat dapat masuk dan
                tersinkronisasi real-time via Firestore.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={retrying}
            onClick={onClose}
            aria-label="Tutup panduan autentikasi"
            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-50 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Diagnostic summary strip */}
        <div className="px-6 pt-5">
          <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-950">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="font-medium leading-relaxed">
                  {failure.message}
                  {failure.code && (
                    <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-white border border-amber-200 font-mono text-[11px] text-amber-900">
                      {failure.code}
                    </span>
                  )}
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <span className="text-[11px] text-amber-900">Domain aktif:</span>
                  <code className="px-2 py-0.5 bg-white border border-amber-200 rounded font-mono text-[11px] text-slate-900 break-all">
                    {failure.hostname}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyValue(failure.hostname, 'domain')}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-amber-300 hover:bg-amber-100 rounded text-[11px] font-medium text-amber-950 cursor-pointer"
                  >
                    {copiedField === 'domain' ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-700" aria-hidden="true" />
                        <span>Domain Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" aria-hidden="true" />
                        <span>Salin Domain</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Tab selector */}
          <div
            role="tablist"
            aria-label="Pilih topik panduan autentikasi"
            className="mt-4 grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'domain'}
              onClick={() => setActiveTab('domain')}
              className={`flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                activeTab === 'domain'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Globe className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>1. Verifikasi Domain Firebase</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'verified'}
              onClick={() => setActiveTab('verified')}
              className={`flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                activeTab === 'verified'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>2. Fix &apos;Firebase App not verified&apos;</span>
            </button>
          </div>
        </div>

        {/* Tab body */}
        <div className="px-6 py-5 max-h-[55vh] overflow-y-auto">
          {activeTab === 'domain' ? (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Firebase Authentication memblokir login popup jika hostname aplikasi saat ini belum
                terdaftar di daftar domain resmi proyek{' '}
                <code className="font-mono text-slate-900">{failure.projectId}</code>.
              </p>

              <ol className="space-y-3 text-xs text-slate-700">
                <li className="flex gap-3 p-3 rounded-lg border border-slate-200 bg-[#F8F9FA]">
                  <span className="w-5 h-5 rounded-full bg-[#164E38] text-white font-mono text-[11px] font-semibold flex items-center justify-center shrink-0">
                    1
                  </span>
                  <div className="space-y-1.5">
                    <p className="font-semibold text-slate-900">
                      Buka Pengaturan Authorized Domains di Firebase Console
                    </p>
                    <p className="text-slate-600 leading-relaxed">
                      Masuk ke menu <strong>Authentication → Settings → Authorized domains</strong>{' '}
                      pada proyek Firebase Anda.
                    </p>
                    <a
                      href={firebaseAuthSettingsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[#164E38] font-medium underline underline-offset-2 hover:text-[#113D2B]"
                    >
                      <span>Buka Authorized Domains ({failure.projectId})</span>
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                  </div>
                </li>

                <li className="flex gap-3 p-3 rounded-lg border border-slate-200 bg-[#F8F9FA]">
                  <span className="w-5 h-5 rounded-full bg-[#164E38] text-white font-mono text-[11px] font-semibold flex items-center justify-center shrink-0">
                    2
                  </span>
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">
                      Tambahkan Hostname Aktif Tanpa Protokol
                    </p>
                    <p className="text-slate-600 leading-relaxed">
                      Klik <strong>Add domain</strong> dan tempel hostname persis berikut (tanpa{' '}
                      <code className="font-mono">https://</code>):
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="px-2.5 py-1 bg-white border border-slate-300 rounded font-mono text-[11px] text-slate-900 break-all">
                        {failure.hostname}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyValue(failure.hostname, 'domain')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded text-[11px] font-medium text-slate-800 cursor-pointer"
                      >
                        {copiedField === 'domain' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-700" aria-hidden="true" />
                            <span>Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" aria-hidden="true" />
                            <span>Salin</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </li>

                <li className="flex gap-3 p-3 rounded-lg border border-slate-200 bg-[#F8F9FA]">
                  <span className="w-5 h-5 rounded-full bg-[#164E38] text-white font-mono text-[11px] font-semibold flex items-center justify-center shrink-0">
                    3
                  </span>
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">
                      Samakan Authorized JavaScript Origins di Google Cloud
                    </p>
                    <p className="text-slate-600 leading-relaxed">
                      Pada <strong>Google Cloud Console → APIs &amp; Services → Credentials</strong>,
                      pastikan Origin URL lengkap berikut ada di daftar{' '}
                      <em>Authorized JavaScript origins</em> untuk mencegah{' '}
                      <code className="font-mono">origin_mismatch</code>:
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="px-2.5 py-1 bg-white border border-slate-300 rounded font-mono text-[11px] text-slate-900 break-all">
                        {failure.origin}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyValue(failure.origin, 'origin')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded text-[11px] font-medium text-slate-800 cursor-pointer"
                      >
                        {copiedField === 'origin' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-700" aria-hidden="true" />
                            <span>Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" aria-hidden="true" />
                            <span>Salin Origin</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </li>

                <li className="flex gap-3 p-3 rounded-lg border border-slate-200 bg-[#F8F9FA]">
                  <span className="w-5 h-5 rounded-full bg-[#164E38] text-white font-mono text-[11px] font-semibold flex items-center justify-center shrink-0">
                    4
                  </span>
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-900">
                      Pastikan Provider Google Aktif &amp; Support Email Terisi
                    </p>
                    <p className="text-slate-600 leading-relaxed">
                      Di Firebase Console → <strong>Authentication → Sign-in method</strong>,
                      pastikan provider <strong>Google</strong> berstatus <em>Enabled</em> dan{' '}
                      <em>Project support email</em> sudah dipilih.
                    </p>
                  </div>
                </li>
              </ol>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Aplikasi ini kini menggunakan{' '}
                <strong className="text-slate-900">Full Firebase</strong> (autentikasi profil dasar
                + Firestore real-time tanpa scope Google Sheets). Jika pesan{' '}
                <strong className="text-slate-900">&ldquo;Firebase App not verified&rdquo;</strong>{' '}
                masih muncul karena status layar OAuth proyek Anda di Google Cloud masih dalam mode{' '}
                <strong>Testing</strong>, ikuti langkah berikut:
              </p>

              <ol className="space-y-3 text-xs text-slate-700">
                <li className="flex gap-3 p-3 rounded-lg border border-emerald-200 bg-emerald-50/60">
                  <span className="w-5 h-5 rounded-full bg-[#164E38] text-white font-mono text-[11px] font-semibold flex items-center justify-center shrink-0">
                    1
                  </span>
                  <div className="space-y-1.5">
                    <p className="font-semibold text-slate-900">
                      Ubah Status OAuth Consent Screen ke &ldquo;In production&rdquo;
                    </p>
                    <p className="text-slate-700 leading-relaxed">
                      Karena aplikasi hanya meminta profil login dasar Firebase (email &amp; nama,
                      tanpa scope Google Sheets/Drive), mengubah status dari{' '}
                      <strong>Testing</strong> ke <strong>In production</strong> tidak memerlukan
                      audit sensitif yang rumit dan langsung mengizinkan semua perangkat login.
                    </p>
                    <a
                      href={gcpConsentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[#164E38] font-medium underline underline-offset-2 hover:text-[#113D2B]"
                    >
                      <span>Buka OAuth Consent Screen ({failure.projectId})</span>
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                  </div>
                </li>

                <li className="flex gap-3 p-3 rounded-lg border border-slate-200 bg-[#F8F9FA]">
                  <span className="w-5 h-5 rounded-full bg-[#164E38] text-white font-mono text-[11px] font-semibold flex items-center justify-center shrink-0">
                    2
                  </span>
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-900">
                      Alternatif Cepat: Tambahkan Email Perangkat Lain di Test Users
                    </p>
                    <p className="text-slate-600 leading-relaxed">
                      Jika tetap menggunakan mode <strong>Testing</strong>, buka menu{' '}
                      <strong>OAuth consent screen → Audience → Test users</strong> lalu klik{' '}
                      <strong>Add users</strong> dan masukkan email Gmail perangkat lain.
                    </p>
                  </div>
                </li>

                <li className="flex gap-3 p-3 rounded-lg border border-slate-200 bg-[#F8F9FA]">
                  <span className="w-5 h-5 rounded-full bg-[#164E38] text-white font-mono text-[11px] font-semibold flex items-center justify-center shrink-0">
                    3
                  </span>
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-900">
                      Melewati Peringatan di Layar Test User
                    </p>
                    <p className="text-slate-600 leading-relaxed">
                      Pada layar peringatan{' '}
                      <em>&ldquo;Google hasn&apos;t verified this app&rdquo;</em>, klik{' '}
                      <strong>Advanced (Lanjutan)</strong> di kiri bawah → klik{' '}
                      <strong>Go to {failure.projectId}.firebaseapp.com (unsafe)</strong> → klik{' '}
                      <strong>Continue</strong>.
                    </p>
                  </div>
                </li>

                <li className="flex gap-3 p-3 rounded-lg border border-slate-200 bg-[#F8F9FA]">
                  <span className="w-5 h-5 rounded-full bg-[#164E38] text-white font-mono text-[11px] font-semibold flex items-center justify-center shrink-0">
                    4
                  </span>
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-900">
                      Izinkan Popup Browser pada HP / Tablet
                    </p>
                    <p className="text-slate-600 leading-relaxed">
                      Pastikan pemblokir popup tidak memblokir jendela login Google di browser
                      perangkat Anda sebelum menekan <strong>Masuk dengan Google</strong>.
                    </p>
                  </div>
                </li>
              </ol>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-[#F8F9FA] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <a
              href={firebaseAuthSettingsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-slate-900 underline underline-offset-2"
            >
              <span>Firebase Console</span>
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>
            <a
              href={gcpCredentialsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-slate-900 underline underline-offset-2"
            >
              <span>OAuth Credentials</span>
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          </div>

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={retrying}
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              Tutup
            </button>
            {onRetry && failure.source !== 'manual' && (
              <button
                type="button"
                disabled={retrying}
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#164E38] hover:bg-[#113D2B] disabled:opacity-60 rounded-lg whitespace-nowrap cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>{retrying ? 'Menghubungkan...' : 'Coba Masuk Ulang'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
