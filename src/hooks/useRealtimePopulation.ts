import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { AuthFailureState } from '../components/AuthHelpModal';
import {
  AuthTroubleshootingError,
  FIREBASE_PROJECT_ID,
  googleSignIn,
  initAuth,
  logout,
  UnauthorizedDomainError,
} from '../lib/firebaseAuth';
import {
  createBatchInFirestore,
  deleteBatchInFirestore,
  seedInitialBatchesIfEmpty,
  subscribeWorkspaceBatches,
  subscribeWorkspaceEvents,
  testConnection,
  updateBatchInFirestore,
} from '../lib/firestoreDb';
import type {
  CreateBatchInput,
  PigBatch,
  PopulationEvent,
  UpdateBatchInput,
} from '../types/population';

export type ConnectionState =
  | 'connecting'
  | 'cloud-synced'
  | 'connected'
  | 'reconnecting'
  | 'local-sync'
  | 'error';

interface WsServerMessage {
  type: string;
  batches?: PigBatch[];
  events?: PopulationEvent[];
  batch?: PigBatch;
  event?: PopulationEvent;
  id?: string;
  connectedClients?: number;
  error?: string;
}

const LOCAL_STORAGE_KEY = 'bhumi_swana_population_v1';
const BROADCAST_CHANNEL_NAME = 'bhumi-swana-population';

function createInitialLocalSeed(): { batches: PigBatch[]; events: PopulationEvent[] } {
  const now = Date.now();
  const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

  return {
    batches: [
      {
        id: 'batch-a1',
        penName: 'Kandang A1 · Indukan Inti',
        breed: 'Landrace',
        phase: 'Indukan',
        count: 64,
        avgWeightKg: 195,
        healthStatus: 'Sehat',
        notes: 'Siklus laktasi & kebuntingan minggu ke-10 berjalan normal.',
        updatedAt: iso(42),
        updatedBy: 'Kepala Kandang',
      },
      {
        id: 'batch-a2',
        penName: 'Kandang A2 · Pejantan Unggul',
        breed: 'Duroc',
        phase: 'Pejantan',
        count: 14,
        avgWeightKg: 230,
        healthStatus: 'Sehat',
        notes: 'Koleksi semen inseminasi buatan terjadwal tiap Senin & Kamis.',
        updatedAt: iso(95),
        updatedBy: 'Tim Genetika',
      },
      {
        id: 'batch-b1',
        penName: 'Kandang B1 · Nursery Pemanas',
        breed: 'Persilangan F1',
        phase: 'Anak Babi',
        count: 186,
        avgWeightKg: 6.4,
        healthStatus: 'Sehat',
        notes: 'Litter rata-rata 11.6 ekor/induk dengan lampu penghangat otomatis.',
        updatedAt: iso(25),
        updatedBy: 'Operator Blok B',
      },
      {
        id: 'batch-b2',
        penName: 'Kandang B2 · Sapihan Awal',
        breed: 'Yorkshire',
        phase: 'Sapihan',
        count: 142,
        avgWeightKg: 18.5,
        healthStatus: 'Sehat',
        notes: 'Transisi pakan starter protein 20% dan probiotik air minum.',
        updatedAt: iso(18),
        updatedBy: 'Operator Blok B',
      },
      {
        id: 'batch-c1',
        penName: 'Kandang C1 · Grower Utama',
        breed: 'Persilangan F1',
        phase: 'Pembesaran',
        count: 238,
        avgWeightKg: 54.0,
        healthStatus: 'Sehat',
        notes: 'Pertambahan bobot harian (ADG) stabil di 815 g/ekor/hari.',
        updatedAt: iso(12),
        updatedBy: 'Mandor Pakan',
      },
      {
        id: 'batch-d1',
        penName: 'Kandang D1 · Finisher Siap Distribusi',
        breed: 'Duroc',
        phase: 'Penggemukan',
        count: 168,
        avgWeightKg: 104.5,
        healthStatus: 'Siap Panen',
        notes: 'Target bobot panen tercapai, siap pengiriman mitra RPH minggu ini.',
        updatedAt: iso(6),
        updatedBy: 'Logistik Farm',
      },
    ],
    events: [
      {
        id: 'evt-seed-1',
        type: 'update',
        penName: 'Kandang D1 · Finisher Siap Distribusi',
        breed: 'Duroc',
        phase: 'Penggemukan',
        previousCount: 162,
        newCount: 168,
        delta: 6,
        actor: 'Logistik Farm',
        timestamp: iso(6),
      },
      {
        id: 'evt-seed-2',
        type: 'update',
        penName: 'Kandang C1 · Grower Utama',
        breed: 'Persilangan F1',
        phase: 'Pembesaran',
        previousCount: 230,
        newCount: 238,
        delta: 8,
        actor: 'Mandor Pakan',
        timestamp: iso(12),
      },
    ],
  };
}

function loadLocalStore(): { batches: PigBatch[]; events: PopulationEvent[] } {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.batches) && Array.isArray(parsed.events)) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  const seed = createInitialLocalSeed();
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(seed));
  } catch {
    // ignore storage errors
  }
  return seed;
}

function saveLocalStore(data: { batches: PigBatch[]; events: PopulationEvent[] }): void {
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
}

function isPermissionOrQuotaError(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('Quota exceeded')) {
    return 'Kuota harian database Firestore telah tercapai dan akan direset pada hari berikutnya.';
  }
  if (msg.toLowerCase().includes('insufficient permissions') || msg.includes('PERMISSION_DENIED')) {
    return 'Akses database ditolak oleh aturan keamanan. Pastikan akun Google Anda terverifikasi atau hubungi pemilik sistem.';
  }
  return null;
}

export function useRealtimePopulation() {
  const [batches, setBatches] = useState<PigBatch[]>([]);
  const [events, setEvents] = useState<PopulationEvent[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [connectedClients, setConnectedClients] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  // Firebase Auth states
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [authBusy, setAuthBusy] = useState<boolean>(false);
  const [unauthorizedDomain, setUnauthorizedDomain] = useState<string | null>(null);
  const [authFailure, setAuthFailure] = useState<AuthFailureState | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const retryFetchTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const localModeRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);
  const seededUidRef = useRef<string | null>(null);

  const batchesRef = useRef<PigBatch[]>([]);
  batchesRef.current = batches;
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  // Throw fatal Firestore errors so React ErrorBoundary renders recovery UI
  if (fatalError) {
    throw fatalError;
  }

  const pushEventIdempotent = useCallback((evt?: PopulationEvent) => {
    if (!evt) return;
    setEvents((prev) => {
      if (prev.some((item) => item.id === evt.id)) return prev;
      return [evt, ...prev].slice(0, 40);
    });
  }, []);

  const handleIncomingPayload = useCallback(
    (msg: WsServerMessage) => {
      if (!mountedRef.current) return;
      if (typeof msg.connectedClients === 'number') {
        setConnectedClients(Math.max(1, msg.connectedClients));
      }

      // When signed in, Firebase Firestore is the authoritative real-time store
      if (userRef.current) {
        return;
      }

      if (msg.type === 'population:init') {
        if (Array.isArray(msg.batches)) setBatches(msg.batches);
        if (Array.isArray(msg.events)) setEvents(msg.events);
        setLoading(false);
        setErrorMessage(null);
      } else if (msg.type === 'population:created' && msg.batch) {
        const incoming = msg.batch;
        setBatches((prev) => {
          if (prev.some((b) => b.id === incoming.id)) return prev;
          return [incoming, ...prev];
        });
        pushEventIdempotent(msg.event);
      } else if (msg.type === 'population:updated' && msg.batch) {
        const incoming = msg.batch;
        setBatches((prev) => prev.map((b) => (b.id === incoming.id ? incoming : b)));
        pushEventIdempotent(msg.event);
      } else if (msg.type === 'population:deleted' && msg.id) {
        const deletedId = msg.id;
        setBatches((prev) => prev.filter((b) => b.id !== deletedId));
        pushEventIdempotent(msg.event);
      } else if (msg.type === 'population:error' && msg.error) {
        setErrorMessage(msg.error);
      }
    },
    [pushEventIdempotent]
  );

  const activateLocalSyncMode = useCallback(() => {
    if (!mountedRef.current || localModeRef.current) return;
    localModeRef.current = true;
    if (!userRef.current) {
      const localData = loadLocalStore();
      setBatches(localData.batches);
      setEvents(localData.events);
      setLoading(false);
      setErrorMessage(null);
      setConnectionState('local-sync');
      setConnectedClients(1);
    }

    if (typeof BroadcastChannel !== 'undefined' && !channelRef.current) {
      const ch = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channelRef.current = ch;
      ch.onmessage = (evt) => {
        if (!mountedRef.current) return;
        const msg = evt.data as WsServerMessage;
        if (msg && typeof msg.type === 'string') {
          handleIncomingPayload(msg);
        }
      };
    }
  }, [handleIncomingPayload]);

  const connectSseFallback = useCallback(() => {
    if (!mountedRef.current || localModeRef.current || sseRef.current) return;

    try {
      const es = new EventSource('/api/population/stream');
      sseRef.current = es;

      es.onopen = () => {
        if (!mountedRef.current) return;
        if (!userRef.current) {
          setConnectionState('connected');
        }
        setErrorMessage(null);
      };

      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as WsServerMessage;
          handleIncomingPayload(msg);
        } catch {
          // ignore malformed SSE frame
        }
      };

      es.onerror = () => {
        es.close();
        sseRef.current = null;
      };
    } catch {
      // EventSource unavailable
    }
  }, [handleIncomingPayload]);

  const connectWs = useCallback(() => {
    if (!mountedRef.current || localModeRef.current) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (!mountedRef.current) return;
        reconnectAttemptRef.current = 0;
        if (!userRef.current) {
          setConnectionState('connected');
        }
        setErrorMessage(null);
        if (sseRef.current) {
          sseRef.current.close();
          sseRef.current = null;
        }
      };

      socket.onmessage = (messageEvent) => {
        try {
          const msg = JSON.parse(messageEvent.data) as WsServerMessage;
          handleIncomingPayload(msg);
        } catch {
          // ignore malformed frame
        }
      };

      socket.onclose = () => {
        if (!mountedRef.current || localModeRef.current) return;
        const attempt = reconnectAttemptRef.current;
        reconnectAttemptRef.current += 1;

        if (attempt >= 2) {
          connectSseFallback();
        } else if (!userRef.current) {
          setConnectionState('reconnecting');
        }

        const delay = Math.min(6000, 1000 * Math.pow(1.6, attempt));
        reconnectTimerRef.current = window.setTimeout(() => {
          connectWs();
        }, delay);
      };

      socket.onerror = () => {
        if (!mountedRef.current || localModeRef.current) return;
        if (reconnectAttemptRef.current >= 1) {
          connectSseFallback();
        }
      };
    } catch {
      connectSseFallback();
    }
  }, [connectSseFallback, handleIncomingPayload]);

  const fetchSnapshot = useCallback(
    async (attempt = 0) => {
      if (!mountedRef.current) return;
      try {
        const res = await fetch('/api/population', {
          headers: { Accept: 'application/json' },
        });
        const contentType = res.headers.get('content-type') || '';

        if (!res.ok || !contentType.includes('application/json')) {
          if (res.status === 404 || (res.ok && contentType.includes('text/html') && attempt >= 1)) {
            activateLocalSyncMode();
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }

        const data = (await res.json()) as {
          batches: PigBatch[];
          events: PopulationEvent[];
          connectedClients: number;
        };
        if (!mountedRef.current) return;
        localModeRef.current = false;
        if (!userRef.current) {
          setBatches(data.batches);
          setEvents(data.events);
          setLoading(false);
        }
        setConnectedClients(data.connectedClients || 1);
        setErrorMessage(null);
        connectWs();
      } catch {
        if (!mountedRef.current) return;
        if (attempt < 3) {
          const delay = 1200 * (attempt + 1);
          retryFetchTimerRef.current = window.setTimeout(() => {
            fetchSnapshot(attempt + 1);
          }, delay);
        } else {
          activateLocalSyncMode();
        }
      }
    },
    [activateLocalSyncMode, connectWs]
  );

  // Startup Firestore connection check + Firebase Auth listener
  useEffect(() => {
    testConnection();
    const unsub = initAuth(
      (firebaseUser) => {
        if (!mountedRef.current) return;
        setUser(firebaseUser);
        setAuthReady(true);
      },
      () => {
        if (!mountedRef.current) return;
        setUser(null);
        setAuthReady(true);
      }
    );
    return () => unsub();
  }, []);

  // Firestore real-time cross-device listeners
  useEffect(() => {
    if (!authReady || !user) return;
    if (!user.emailVerified) {
      setErrorMessage(
        'Email akun Google Anda belum terverifikasi. Gunakan akun Google dengan email terverifikasi untuk sinkronisasi Firebase.'
      );
      return;
    }

    setConnectionState('cloud-synced');

    if (seededUidRef.current !== user.uid) {
      seededUidRef.current = user.uid;
      seedInitialBatchesIfEmpty(user, createInitialLocalSeed().batches).catch((err) => {
        if (!mountedRef.current) return;
        const readable = isPermissionOrQuotaError(err);
        if (readable) setErrorMessage(readable);
      });
    }

    const unsubBatches = subscribeWorkspaceBatches(
      (cloudBatches) => {
        if (!mountedRef.current) return;
        setBatches(cloudBatches);
        setLoading(false);
        setConnectionState('cloud-synced');
      },
      (err) => {
        if (!mountedRef.current) return;
        const readable = isPermissionOrQuotaError(err);
        if (readable) {
          setErrorMessage(readable);
        } else {
          setFatalError(err);
        }
      }
    );

    const unsubEvents = subscribeWorkspaceEvents(
      (cloudEvents) => {
        if (!mountedRef.current) return;
        setEvents(cloudEvents);
      },
      (err) => {
        if (!mountedRef.current) return;
        const readable = isPermissionOrQuotaError(err);
        if (readable) {
          setErrorMessage(readable);
        } else {
          setFatalError(err);
        }
      }
    );

    return () => {
      unsubBatches();
      unsubEvents();
    };
  }, [authReady, user]);

  // Fallback WS/SSE listener (used prior to Google Sign-In)
  useEffect(() => {
    mountedRef.current = true;
    fetchSnapshot(0);

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
      if (retryFetchTimerRef.current !== null) window.clearTimeout(retryFetchTimerRef.current);
      if (wsRef.current) wsRef.current.close();
      if (sseRef.current) sseRef.current.close();
      if (channelRef.current) channelRef.current.close();
    };
  }, [fetchSnapshot]);

  const buildAuthFailure = useCallback((err: unknown): AuthFailureState => {
    const hostname = window.location.hostname || 'localhost';
    const origin = window.location.origin;

    if (err instanceof UnauthorizedDomainError) {
      return {
        category: 'unauthorized-domain',
        source: 'signin',
        code: err.code,
        message: err.message,
        hostname: err.hostname,
        origin,
        projectId: FIREBASE_PROJECT_ID,
      };
    }

    if (err instanceof AuthTroubleshootingError) {
      return {
        category: err.category,
        source: 'signin',
        code: err.code,
        message: err.message,
        hostname,
        origin,
        projectId: FIREBASE_PROJECT_ID,
      };
    }

    return {
      category: 'generic',
      source: 'signin',
      message:
        err instanceof Error ? err.message : 'Gagal menyelesaikan autentikasi Google & Firebase.',
      hostname,
      origin,
      projectId: FIREBASE_PROJECT_ID,
    };
  }, []);

  const signInGoogle = useCallback(async () => {
    setAuthBusy(true);
    setErrorMessage(null);
    setUnauthorizedDomain(null);
    try {
      const res = await googleSignIn();
      setUser(res.user);
      setAuthReady(true);
      setAuthFailure(null);
    } catch (err) {
      const failure = buildAuthFailure(err);
      setAuthFailure(failure);
      if (err instanceof UnauthorizedDomainError) {
        setUnauthorizedDomain(err.hostname);
      } else {
        setErrorMessage(failure.message);
      }
    } finally {
      setAuthBusy(false);
    }
  }, [buildAuthFailure]);

  const openAuthHelpModal = useCallback(() => {
    setAuthFailure({
      category: 'app-not-verified',
      source: 'manual',
      message:
        'Gunakan panduan berikut untuk memverifikasi domain Firebase atau mengatasi peringatan "Firebase App not verified".',
      hostname: window.location.hostname || 'localhost',
      origin: window.location.origin,
      projectId: FIREBASE_PROJECT_ID,
    });
  }, []);

  const signOutGoogle = useCallback(async () => {
    await logout();
    setUser(null);
    seededUidRef.current = null;
    setConnectionState(localModeRef.current ? 'local-sync' : 'connected');
  }, []);

  const addBatch = useCallback(
    async (input: CreateBatchInput): Promise<{ ok: boolean; error?: string }> => {
      setErrorMessage(null);
      const currentUser = userRef.current;

      if (currentUser) {
        try {
          await createBatchInFirestore(currentUser, input);
          return { ok: true };
        } catch (err) {
          const readable = isPermissionOrQuotaError(err);
          const msg = readable || (err instanceof Error ? err.message : 'Gagal menyimpan ke Cloud.');
          setErrorMessage(msg);
          return { ok: false, error: msg };
        }
      }

      if (localModeRef.current) {
        const now = new Date().toISOString();
        const batch: PigBatch = {
          id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          penName: input.penName,
          breed: input.breed,
          phase: input.phase,
          count: input.count,
          avgWeightKg: Math.round(input.avgWeightKg * 10) / 10,
          healthStatus: input.healthStatus,
          notes: input.notes,
          updatedAt: now,
          updatedBy: input.actor || 'Petugas Kandang',
        };
        const evt: PopulationEvent = {
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'create',
          penName: batch.penName,
          breed: batch.breed,
          phase: batch.phase,
          previousCount: null,
          newCount: batch.count,
          delta: batch.count,
          actor: batch.updatedBy,
          timestamp: now,
        };
        const nextBatches = [batch, ...batchesRef.current];
        const nextEvents = [evt, ...events].slice(0, 40);
        setBatches(nextBatches);
        setEvents(nextEvents);
        saveLocalStore({ batches: nextBatches, events: nextEvents });
        channelRef.current?.postMessage({ type: 'population:created', batch, event: evt });
        return { ok: true };
      }

      try {
        const res = await fetch('/api/population', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const data = await res.json();
        if (!res.ok) {
          const msg = data.error || 'Gagal menyimpan data kandang.';
          setErrorMessage(msg);
          return { ok: false, error: msg };
        }
        if (data.batch) {
          setBatches((prev) => {
            if (prev.some((b) => b.id === data.batch.id)) return prev;
            return [data.batch, ...prev];
          });
        }
        if (data.event) pushEventIdempotent(data.event);
        return { ok: true };
      } catch {
        const msg = 'Koneksi terputus saat menyimpan data.';
        setErrorMessage(msg);
        return { ok: false, error: msg };
      }
    },
    [events, pushEventIdempotent]
  );

  const updateBatch = useCallback(
    async (id: string, input: UpdateBatchInput): Promise<{ ok: boolean; error?: string }> => {
      setErrorMessage(null);
      const snapshot = batchesRef.current;
      const existingSnapshot = snapshot.find((b) => b.id === id);
      if (!existingSnapshot) return { ok: false, error: 'Data kandang tidak ditemukan.' };

      const currentUser = userRef.current;

      if (currentUser) {
        try {
          await updateBatchInFirestore(currentUser, id, input);
          return { ok: true };
        } catch (err) {
          const readable = isPermissionOrQuotaError(err);
          const msg = readable || (err instanceof Error ? err.message : 'Gagal memperbarui Cloud.');
          setErrorMessage(msg);
          return { ok: false, error: msg };
        }
      }

      if (localModeRef.current) {
        const now = new Date().toISOString();
        const nextCount =
          input.delta !== undefined
            ? Math.max(0, existingSnapshot.count + input.delta)
            : input.count !== undefined
              ? input.count
              : existingSnapshot.count;
        const updated: PigBatch = {
          ...existingSnapshot,
          ...input,
          count: nextCount,
          updatedAt: now,
          updatedBy: input.actor || 'Petugas Kandang',
        };
        const evt: PopulationEvent = {
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'update',
          penName: updated.penName,
          breed: updated.breed,
          phase: updated.phase,
          previousCount: existingSnapshot.count,
          newCount: updated.count,
          delta: updated.count - existingSnapshot.count,
          actor: updated.updatedBy,
          timestamp: now,
        };
        const nextBatches = snapshot.map((b) => (b.id === id ? updated : b));
        const nextEvents = [evt, ...events].slice(0, 40);
        setBatches(nextBatches);
        setEvents(nextEvents);
        saveLocalStore({ batches: nextBatches, events: nextEvents });
        channelRef.current?.postMessage({ type: 'population:updated', batch: updated, event: evt });
        return { ok: true };
      }

      const optimisticCount =
        input.delta !== undefined
          ? Math.max(0, existingSnapshot.count + input.delta)
          : input.count !== undefined
            ? input.count
            : existingSnapshot.count;

      setBatches((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                ...input,
                count: optimisticCount,
                updatedAt: new Date().toISOString(),
                updatedBy: input.actor,
              }
            : item
        )
      );

      try {
        const res = await fetch(`/api/population/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const data = await res.json();
        if (!res.ok) {
          setBatches(snapshot);
          const msg = data.error || 'Gagal memperbarui populasi.';
          setErrorMessage(msg);
          return { ok: false, error: msg };
        }
        if (data.batch) {
          setBatches((prev) => prev.map((b) => (b.id === data.batch.id ? data.batch : b)));
        }
        if (data.event) pushEventIdempotent(data.event);
        return { ok: true };
      } catch {
        setBatches(snapshot);
        const msg = 'Gagal menghubungi server untuk pembaruan.';
        setErrorMessage(msg);
        return { ok: false, error: msg };
      }
    },
    [events, pushEventIdempotent]
  );

  const removeBatch = useCallback(
    async (id: string, actor: string): Promise<{ ok: boolean; error?: string }> => {
      setErrorMessage(null);
      const snapshot = batchesRef.current;
      const target = snapshot.find((b) => b.id === id);
      if (!target) return { ok: false, error: 'Data kandang tidak ditemukan.' };

      const currentUser = userRef.current;

      if (currentUser) {
        try {
          await deleteBatchInFirestore(currentUser, id, actor);
          return { ok: true };
        } catch (err) {
          const readable = isPermissionOrQuotaError(err);
          const msg =
            readable ||
            'Hanya pembuat blok kandang atau admin yang dapat menghapus data kandang ini.';
          setErrorMessage(msg);
          return { ok: false, error: msg };
        }
      }

      if (localModeRef.current) {
        const now = new Date().toISOString();
        const evt: PopulationEvent = {
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'delete',
          penName: target.penName,
          breed: target.breed,
          phase: target.phase,
          previousCount: target.count,
          newCount: 0,
          delta: -target.count,
          actor: actor || 'Petugas Kandang',
          timestamp: now,
        };
        const nextBatches = snapshot.filter((b) => b.id !== id);
        const nextEvents = [evt, ...events].slice(0, 40);
        setBatches(nextBatches);
        setEvents(nextEvents);
        saveLocalStore({ batches: nextBatches, events: nextEvents });
        channelRef.current?.postMessage({ type: 'population:deleted', id, event: evt });
        return { ok: true };
      }

      setBatches((prev) => prev.filter((item) => item.id !== id));

      try {
        const res = await fetch(
          `/api/population/${encodeURIComponent(id)}?actor=${encodeURIComponent(actor)}`,
          { method: 'DELETE' }
        );
        const data = await res.json();
        if (!res.ok) {
          setBatches(snapshot);
          const msg = data.error || 'Gagal menghapus data kandang.';
          setErrorMessage(msg);
          return { ok: false, error: msg };
        }
        if (data.event) pushEventIdempotent(data.event);
        return { ok: true };
      } catch {
        setBatches(snapshot);
        const msg = 'Koneksi terputus saat menghapus data.';
        setErrorMessage(msg);
        return { ok: false, error: msg };
      }
    },
    [events, pushEventIdempotent]
  );

  return {
    batches,
    events,
    connectionState,
    connectedClients,
    loading,
    errorMessage,
    clearError: () => setErrorMessage(null),
    addBatch,
    updateBatch,
    removeBatch,
    user,
    authBusy,
    unauthorizedDomain,
    dismissUnauthorizedDomain: () => setUnauthorizedDomain(null),
    authFailure,
    dismissAuthFailure: () => setAuthFailure(null),
    openAuthHelpModal,
    signInGoogle,
    signOutGoogle,
  };
}
