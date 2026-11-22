import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import type { AuthFailureCategory } from '../components/AuthHelpModal';

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIREBASE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;

export const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Standard Firebase Google Sign-In provider (no Workspace scopes) so any device/account
// can authenticate seamlessly without triggering unverified Workspace app blocks.
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

let isSigningIn = false;

export class UnauthorizedDomainError extends Error {
  hostname: string;
  code = 'auth/unauthorized-domain';
  constructor(hostname: string) {
    super(
      `Domain "${hostname}" belum terdaftar di Authorized Domains Firebase Authentication untuk proyek ${FIREBASE_PROJECT_ID}.`
    );
    this.name = 'UnauthorizedDomainError';
    this.hostname = hostname;
  }
}

export class AuthTroubleshootingError extends Error {
  category: AuthFailureCategory;
  code?: string;
  constructor(category: AuthFailureCategory, message: string, code?: string) {
    super(message);
    this.name = 'AuthTroubleshootingError';
    this.category = category;
    this.code = code;
  }
}

export function initAuth(
  onAuthSuccess?: (user: User) => void,
  onAuthFailure?: () => void
) {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (!isSigningIn) {
        onAuthSuccess?.(user);
      }
    } else {
      onAuthFailure?.();
    }
  });
}

function mapFirebaseAuthError(err: unknown): Error {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: string }).code)
      : '';
  const rawMessage = err instanceof Error ? err.message : String(err ?? '');
  const lower = rawMessage.toLowerCase();

  if (code === 'auth/unauthorized-domain' || lower.includes('unauthorized-domain')) {
    return new UnauthorizedDomainError(window.location.hostname);
  }

  if (
    lower.includes('not verified') ||
    lower.includes('verifikasi google') ||
    lower.includes('access_denied') ||
    code === 'auth/operation-not-allowed' ||
    code === 'auth/internal-error'
  ) {
    return new AuthTroubleshootingError(
      'app-not-verified',
      'Autentikasi Google mengalami kendala verifikasi aplikasi pada Firebase Authentication.',
      code || 'app_not_verified'
    );
  }

  if (code === 'auth/popup-blocked') {
    return new AuthTroubleshootingError(
      'popup-blocked',
      'Popup login diblokir oleh browser. Izinkan jendela popup untuk situs ini lalu coba masuk ulang.',
      code
    );
  }

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return new AuthTroubleshootingError(
      'popup-closed',
      'Jendela login Google ditutup sebelum selesai atau terhenti oleh peringatan verifikasi.',
      code
    );
  }

  if (code === 'auth/user-mismatch') {
    return new AuthTroubleshootingError(
      'user-mismatch',
      'Akun Google yang dipilih berbeda dengan akun yang sedang masuk. Pilih akun yang sama atau keluar terlebih dahulu.',
      code
    );
  }

  return new AuthTroubleshootingError(
    'generic',
    rawMessage || 'Gagal menyelesaikan proses autentikasi Google.',
    code || undefined
  );
}

export async function googleSignIn(): Promise<{ user: User }> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    return { user: result.user };
  } catch (err: unknown) {
    throw mapFirebaseAuthError(err);
  } finally {
    isSigningIn = false;
  }
}

export async function logout(): Promise<void> {
  await auth.signOut();
}
