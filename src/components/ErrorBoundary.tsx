import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    let readable = 'Terjadi kendala saat menghubungkan ke layanan sinkronisasi data.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; operationType?: string };
      if (parsed?.error) {
        if (parsed.error.toLowerCase().includes('permission') || parsed.error.includes('insufficient')) {
          readable =
            'Akses ditolak oleh aturan keamanan database. Pastikan Anda masuk dengan akun Google terverifikasi atau memiliki izin yang sesuai.';
        } else if (parsed.error.toLowerCase().includes('quota')) {
          readable =
            'Kuota baca/tulis harian Firestore sedang mencapai batas. Kuota akan diperbarui kembali pada hari berikutnya.';
        } else {
          readable = parsed.error;
        }
      }
    } catch {
      if (error.message) readable = error.message;
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 text-center shadow-sm">
            <AlertCircle className="w-10 h-10 text-red-600 mx-auto mb-3" aria-hidden="true" />
            <h1 className="text-lg font-semibold text-slate-900">
              Terjadi Kendala Sinkronisasi Data
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 bg-[#164E38] hover:bg-[#113D2B] text-white text-xs font-medium rounded-lg cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Muat Ulang Halaman</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
