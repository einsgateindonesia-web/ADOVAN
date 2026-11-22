import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIREBASE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;

export const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Basic Google Sign-In provider (NO Workspace scopes) so any device/account can
// sign in for real-time Firestore cross-device sync without unverified app blocks.
const basicGoogleProvider = new GoogleAuthProvider();
basicGoogleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Dedicated Google Sheets OAuth provider (requested ONLY when user links Sheets).
const sheetsGoogleProvider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  sheetsGoogleProvider.addScope(scope);
}
sheetsGoogleProvider.setCustomParameters({
  prompt: 'select_account',
});

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export class UnauthorizedDomainError extends Error {
  hostname: string;
  constructor(hostname: string) {
    super(
      `Domain "${hostname}" belum terdaftar di Authorized Domains Firebase Authentication untuk proyek ${FIREBASE_PROJECT_ID}.`
    );
    this.name = 'UnauthorizedDomainError';
    this.hostname = hostname;
  }
}

export function initAuth(
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (!isSigningIn) {
        onAuthSuccess?.(user, cachedAccessToken);
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure?.();
    }
  });
}

function mapFirebaseAuthError(err: unknown): Error {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: string }).code)
      : '';

  if (code === 'auth/unauthorized-domain') {
    return new UnauthorizedDomainError(window.location.hostname);
  }
  if (code === 'auth/popup-blocked') {
    return new Error('Popup login diblokir oleh browser. Izinkan popup lalu coba lagi.');
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return new Error('Proses masuk Google dibatalkan sebelum selesai.');
  }
  if (code === 'auth/user-mismatch') {
    return new Error(
      'Akun Google yang dipilih berbeda dengan akun yang sedang masuk. Pilih akun yang sama atau keluar terlebih dahulu.'
    );
  }
  if (err instanceof Error) return err;
  return new Error('Gagal masuk dengan akun Google.');
}

// Primary cross-device sign-in (Firestore sync, works on all devices without Workspace verification block)
export async function googleSignIn(): Promise<{ user: User }> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, basicGoogleProvider);
    return { user: result.user };
  } catch (err: unknown) {
    throw mapFirebaseAuthError(err);
  } finally {
    isSigningIn = false;
  }
}

// Secondary opt-in authorization for Google Sheets API access
export async function authorizeGoogleSheets(): Promise<{ user: User; accessToken: string }> {
  try {
    isSigningIn = true;
    const result = auth.currentUser
      ? await reauthenticateWithPopup(auth.currentUser, sheetsGoogleProvider)
      : await signInWithPopup(auth, sheetsGoogleProvider);

    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error(
        'Izin akses Google Sheets tidak diperoleh. Pastikan kotak izin Google Sheets dicentang saat menyetujui akses.'
      );
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (err: unknown) {
    throw mapFirebaseAuthError(err);
  } finally {
    isSigningIn = false;
  }
}

export function getAccessToken(): string | null {
  return cachedAccessToken;
}

export function clearAccessToken(): void {
  cachedAccessToken = null;
}

export async function logout(): Promise<void> {
  cachedAccessToken = null;
  await auth.signOut();
}
