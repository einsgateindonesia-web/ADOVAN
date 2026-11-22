import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({
  prompt: 'select_account',
});

let isSigningIn = false;
let cachedAccessToken: string | null = null;

interface GisTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GisGlobal {
  accounts?: {
    oauth2?: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (resp: GisTokenResponse) => void;
        error_callback?: (err: { type?: string; message?: string }) => void;
      }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
      revoke?: (token: string, done?: () => void) => void;
    };
  };
}

function loadGisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const win = window as unknown as { google?: GisGlobal };
    if (win.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Gagal memuat Google Sign-In.')), {
        once: true,
      });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Gagal memuat layanan login Google.'));
    document.head.appendChild(script);
  });
}

async function requestTokenViaGis(): Promise<string> {
  if (!firebaseConfig.oAuthClientId) {
    throw new Error(
      `Domain "${window.location.hostname}" belum terdaftar di Firebase Auth Authorized Domains.`
    );
  }
  await loadGisScript();
  const win = window as unknown as { google?: GisGlobal };
  const oauth2 = win.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error('Layanan Google OAuth tidak tersedia di browser ini.');
  }

  return new Promise<string>((resolve, reject) => {
    const tokenClient = oauth2.initTokenClient({
      client_id: firebaseConfig.oAuthClientId,
      scope: SCOPES.join(' '),
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(
            new Error(
              resp.error_description ||
                resp.error ||
                'Izin akses Google Sheets tidak diberikan.'
            )
          );
          return;
        }
        resolve(resp.access_token);
      },
      error_callback: (err) => {
        reject(new Error(err?.message || 'Jendela login Google dibatalkan atau diblokir.'));
      },
    });
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

export function initAuth(
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthSuccess?.(user, null);
      }
    } else if (!cachedAccessToken) {
      onAuthFailure?.();
    }
  });
}

export async function googleSignIn(): Promise<{ user: User | null; accessToken: string }> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Token akses Google Sheets tidak ditemukan. Silakan coba masuk kembali.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (err: unknown) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: string }).code)
        : '';

    if (code === 'auth/unauthorized-domain') {
      // Fallback to Google Identity Services OAuth client if Firebase Auth domain isn't allowlisted yet
      const gisToken = await requestTokenViaGis();
      cachedAccessToken = gisToken;
      return { user: auth.currentUser, accessToken: gisToken };
    }
    if (code === 'auth/popup-blocked') {
      throw new Error('Popup login diblokir oleh browser. Izinkan popup lalu coba lagi.');
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('Proses masuk Google dibatalkan sebelum selesai.');
    }
    throw err;
  } finally {
    isSigningIn = false;
  }
}

export function getAccessToken(): string | null {
  return cachedAccessToken;
}

export async function logout(): Promise<void> {
  const tokenToRevoke = cachedAccessToken;
  cachedAccessToken = null;
  if (tokenToRevoke) {
    const win = window as unknown as { google?: GisGlobal };
    try {
      win.google?.accounts?.oauth2?.revoke?.(tokenToRevoke);
    } catch {
      // ignore revoke error
    }
  }
  await auth.signOut();
}
