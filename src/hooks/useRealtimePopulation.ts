import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { PendingSheetConfirmation } from '../components/ConfirmMutationModal';
import {
  getAccessToken,
  googleSignIn,
  initAuth,
  logout,
  UnauthorizedDomainError,
} from '../lib/firebaseAuth';
import {
  appendSheetAuditEvent,
  createPopulationSpreadsheet,
  extractSpreadsheetId,
  getSpreadsheetMetadata,
  readBatchesFromSheet,
  writeAllBatchesToSheet,
  type SpreadsheetInfo,
} from '../lib/googleSheets';
import type {
  CreateBatchInput,
  PigBatch,
  PopulationEvent,
  UpdateBatchInput,
} from '../types/population';

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'sheets-synced'
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
  sheet?: { spreadsheetId: string; title: string; activeSheetName: string } | null;
  connectedClients?: number;
  error?: string;
}

const LOCAL_STORAGE_KEY = 'bhumi_swana_population_v1';
const LOCAL_SHEET_ID_KEY = 'bhumi_swana_sheet_meta_v1';
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

function getInitialSheetParams(): { sheetId: string; tabName: string } {
  try {
    const params = new URLSearchParams(window.location.search);
    const urlSheet = params.get('sheet') || '';
    const urlTab = params.get('tab') || '';
    if (urlSheet) return { sheetId: urlSheet, tabName: urlTab };
    const stored = window.localStorage.getItem(LOCAL_SHEET_ID_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as { spreadsheetId?: string; activeSheetName?: string };
      if (parsed.spreadsheetId) {
        return {
          sheetId: parsed.spreadsheetId,
          tabName: parsed.activeSheetName || '',
        };
      }
    }
  } catch {
    // ignore
  }
  return { sheetId: '', tabName: '' };
}

export function useRealtimePopulation() {
  const [batches, setBatches] = useState<PigBatch[]>([]);
  const [events, setEvents] = useState<PopulationEvent[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [connectedClients, setConnectedClients] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Google Auth + Sheets states
  const [user, setUser] = useState<User | null>(null);
  const [hasAccessToken, setHasAccessToken] = useState<boolean>(false);
  const [authBusy, setAuthBusy] = useState<boolean>(false);
  const [unauthorizedDomain, setUnauthorizedDomain] = useState<string | null>(null);
  const [sheetInfo, setSheetInfo] = useState<SpreadsheetInfo | null>(null);
  const [sheetBusy, setSheetBusy] = useState<boolean>(false);
  const [lastSheetSyncAt, setLastSheetSyncAt] = useState<string | null>(null);
  const [prefilledSheetId, setPrefilledSheetId] = useState<string>(() => getInitialSheetParams().sheetId);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingSheetConfirmation | null>(null);
  const [confirmBusy, setConfirmBusy] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const retryFetchTimerRef = useRef<number | null>(null);
  const sheetPollTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const localModeRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);

  const batchesRef = useRef<PigBatch[]>([]);
  batchesRef.current = batches;
  const sheetInfoRef = useRef<SpreadsheetInfo | null>(null);
  sheetInfoRef.current = sheetInfo;

  const pushEventIdempotent = useCallback((evt?: PopulationEvent) => {
    if (!evt) return;
    setEvents((prev) => {
      if (prev.some((item) => item.id === evt.id)) return prev;
      return [evt, ...prev].slice(0, 40);
    });
  }, []);

  const persistSheetMeta = useCallback(
    async (info: SpreadsheetInfo | null) => {
      try {
        if (info) {
          window.localStorage.setItem(
            LOCAL_SHEET_ID_KEY,
            JSON.stringify({
              spreadsheetId: info.spreadsheetId,
              activeSheetName: info.activeSheetName,
            })
          );
          const url = new URL(window.location.href);
          url.searchParams.set('sheet', info.spreadsheetId);
          url.searchParams.set('tab', info.activeSheetName);
          window.history.replaceState({}, '', url.toString());
          setPrefilledSheetId(info.spreadsheetId);
        } else {
          window.localStorage.removeItem(LOCAL_SHEET_ID_KEY);
          const url = new URL(window.location.href);
          url.searchParams.delete('sheet');
          url.searchParams.delete('tab');
          window.history.replaceState({}, '', url.toString());
        }
      } catch {
        // ignore URL/storage issues
      }

      if (!localModeRef.current) {
        try {
          await fetch('/api/shared-sheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              info
                ? {
                    spreadsheetId: info.spreadsheetId,
                    title: info.title,
                    activeSheetName: info.activeSheetName,
                  }
                : { spreadsheetId: '' }
            ),
          });
        } catch {
          // ignore if server unavailable
        }
      }
    },
    []
  );

  const handleIncomingPayload = useCallback(
    (msg: WsServerMessage) => {
      if (!mountedRef.current) return;
      if (typeof msg.connectedClients === 'number') {
        setConnectedClients(Math.max(1, msg.connectedClients));
      }

      // If Google Sheets is actively linked, Sheets is the cross-device source of truth
      if (sheetInfoRef.current && hasAccessToken) {
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
      } else if (msg.type === 'sheet:updated' && msg.sheet?.spreadsheetId) {
        setPrefilledSheetId(msg.sheet.spreadsheetId);
      } else if (msg.type === 'population:error' && msg.error) {
        setErrorMessage(msg.error);
      }
    },
    [hasAccessToken, pushEventIdempotent]
  );

  const activateLocalSyncMode = useCallback(() => {
    if (!mountedRef.current || localModeRef.current) return;
    localModeRef.current = true;
    const localData = loadLocalStore();
    setBatches(localData.batches);
    setEvents(localData.events);
    setLoading(false);
    setErrorMessage(null);
    setConnectionState(sheetInfoRef.current ? 'sheets-synced' : 'local-sync');
    setConnectedClients(1);

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
        setConnectionState(sheetInfoRef.current ? 'sheets-synced' : 'connected');
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
        setConnectionState(sheetInfoRef.current ? 'sheets-synced' : 'connected');
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
        } else if (!sheetInfoRef.current) {
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
        if (!sheetInfoRef.current) {
          setBatches(data.batches);
          setEvents(data.events);
        }
        setConnectedClients(data.connectedClients || 1);
        setLoading(false);
        setErrorMessage(null);
        connectWs();

        // Also check if server already has a shared spreadsheet ID
        if (!getInitialSheetParams().sheetId) {
          fetch('/api/shared-sheet')
            .then((r) => (r.ok ? r.json() : null))
            .then((s) => {
              if (s?.sheet?.spreadsheetId && mountedRef.current) {
                setPrefilledSheetId(s.sheet.spreadsheetId);
              }
            })
            .catch(() => {});
        }
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

  // Firebase Auth listener
  useEffect(() => {
    const unsub = initAuth(
      (firebaseUser, token) => {
        if (!mountedRef.current) return;
        setUser(firebaseUser);
        setHasAccessToken(Boolean(token));
      },
      () => {
        if (!mountedRef.current) return;
        setUser(null);
        setHasAccessToken(false);
        setSheetInfo(null);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchSnapshot(0);

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
      if (retryFetchTimerRef.current !== null) window.clearTimeout(retryFetchTimerRef.current);
      if (sheetPollTimerRef.current !== null) window.clearInterval(sheetPollTimerRef.current);
      if (wsRef.current) wsRef.current.close();
      if (sseRef.current) sseRef.current.close();
      if (channelRef.current) channelRef.current.close();
    };
  }, [fetchSnapshot]);

  // Pull data from Google Sheets
  const pullFromSheets = useCallback(async (info: SpreadsheetInfo, token: string) => {
    const { batches: remoteBatches, hasHeaders } = await readBatchesFromSheet(
      info.spreadsheetId,
      info.activeSheetName,
      token
    );
    if (!mountedRef.current) return;
    if (remoteBatches.length > 0 || hasHeaders) {
      setBatches(remoteBatches);
      setLastSheetSyncAt(new Date().toISOString());
      setConnectionState('sheets-synced');
    }
    return { remoteBatches, hasHeaders };
  }, []);

  // Poll Google Sheets every 4 seconds when connected
  useEffect(() => {
    if (sheetPollTimerRef.current !== null) {
      window.clearInterval(sheetPollTimerRef.current);
      sheetPollTimerRef.current = null;
    }
    const token = getAccessToken();
    if (!sheetInfo || !hasAccessToken || !token) return;

    sheetPollTimerRef.current = window.setInterval(() => {
      const currentToken = getAccessToken();
      if (!currentToken || !sheetInfoRef.current) return;
      pullFromSheets(sheetInfoRef.current, currentToken).catch((err) => {
        if (!mountedRef.current) return;
        if (err instanceof Error && err.message.includes('Sesi akses Google Sheets berakhir')) {
          setHasAccessToken(false);
          setErrorMessage(err.message);
        }
      });
    }, 4000);

    return () => {
      if (sheetPollTimerRef.current !== null) {
        window.clearInterval(sheetPollTimerRef.current);
        sheetPollTimerRef.current = null;
      }
    };
  }, [hasAccessToken, pullFromSheets, sheetInfo]);

  const connectExistingSheet = useCallback(
    async (inputUrlOrId: string, overrideToken?: string) => {
      const token = overrideToken || getAccessToken();
      if (!token) {
        setErrorMessage('Silakan Sign in with Google terlebih dahulu.');
        return;
      }
      const id = extractSpreadsheetId(inputUrlOrId);
      if (!id) {
        setErrorMessage('Link atau ID Google Spreadsheet tidak valid.');
        return;
      }

      setSheetBusy(true);
      setErrorMessage(null);
      try {
        const preferredTab = getInitialSheetParams().tabName;
        const info = await getSpreadsheetMetadata(id, token, preferredTab);
        const result = await pullFromSheets(info, token);

        setSheetInfo(info);
        setConnectionState('sheets-synced');
        await persistSheetMeta(info);

        if (result && result.remoteBatches.length === 0 && !result.hasHeaders) {
          // Empty spreadsheet: ask explicit confirmation before populating initial data
          setPendingConfirmation({
            title: 'Isi Spreadsheet Kosong dengan Data Saat Ini?',
            description: `Spreadsheet "${info.title}" (tab "${info.activeSheetName}") masih kosong. Tulis ${batchesRef.current.length} data kandang saat ini ke Google Sheets?`,
            confirmLabel: 'Tulis Data ke Sheets',
            onConfirm: async () => {
              await writeAllBatchesToSheet(
                info.spreadsheetId,
                info.activeSheetName,
                token,
                batchesRef.current
              );
              setLastSheetSyncAt(new Date().toISOString());
            },
          });
        }
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Gagal menghubungkan ke Google Sheets.'
        );
      } finally {
        setSheetBusy(false);
      }
    },
    [persistSheetMeta, pullFromSheets]
  );

  const signInGoogle = useCallback(async () => {
    setAuthBusy(true);
    setErrorMessage(null);
    setUnauthorizedDomain(null);
    try {
      const res = await googleSignIn();
      setUser(res.user);
      setHasAccessToken(true);

      const initial = getInitialSheetParams();
      const targetSheet = initial.sheetId || prefilledSheetId;
      if (targetSheet) {
        await connectExistingSheet(targetSheet, res.accessToken);
      }
    } catch (err) {
      if (err instanceof UnauthorizedDomainError) {
        setUnauthorizedDomain(err.hostname);
      } else {
        setErrorMessage(
          err instanceof Error ? err.message : 'Gagal masuk dengan akun Google.'
        );
      }
    } finally {
      setAuthBusy(false);
    }
  }, [connectExistingSheet, prefilledSheetId]);

  const signOutGoogle = useCallback(async () => {
    await logout();
    setUser(null);
    setHasAccessToken(false);
    setSheetInfo(null);
    setConnectionState(localModeRef.current ? 'local-sync' : 'connected');
  }, []);

  const createNewSheet = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setErrorMessage('Silakan Sign in with Google terlebih dahulu.');
      return;
    }

    setPendingConfirmation({
      title: 'Buat Google Spreadsheet Baru?',
      description: `Aplikasi akan membuat file Google Sheets baru di akun Anda berisi ${batchesRef.current.length} data populasi kandang saat ini beserta tab Riwayat_Update.`,
      confirmLabel: 'Buat & Sinkronkan',
      onConfirm: async () => {
        const info = await createPopulationSpreadsheet(token, batchesRef.current);
        setSheetInfo(info);
        setLastSheetSyncAt(new Date().toISOString());
        setConnectionState('sheets-synced');
        await persistSheetMeta(info);
      },
    });
  }, [persistSheetMeta]);

  const changeActiveTab = useCallback(
    async (tabName: string) => {
      const token = getAccessToken();
      if (!token || !sheetInfo) return;
      setSheetBusy(true);
      setErrorMessage(null);
      try {
        const nextInfo: SpreadsheetInfo = { ...sheetInfo, activeSheetName: tabName };
        await pullFromSheets(nextInfo, token);
        setSheetInfo(nextInfo);
        await persistSheetMeta(nextInfo);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Gagal mengganti tab spreadsheet.');
      } finally {
        setSheetBusy(false);
      }
    },
    [persistSheetMeta, pullFromSheets, sheetInfo]
  );

  const syncSheetNow = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !sheetInfo) return;
    setSheetBusy(true);
    setErrorMessage(null);
    try {
      await pullFromSheets(sheetInfo, token);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal menyinkronkan Google Sheets.');
    } finally {
      setSheetBusy(false);
    }
  }, [pullFromSheets, sheetInfo]);

  const disconnectSheet = useCallback(() => {
    setSheetInfo(null);
    setLastSheetSyncAt(null);
    persistSheetMeta(null);
    setConnectionState(localModeRef.current ? 'local-sync' : 'connected');
  }, [persistSheetMeta]);

  const proceedConfirmation = useCallback(async () => {
    if (!pendingConfirmation) return;
    setConfirmBusy(true);
    setErrorMessage(null);
    try {
      await pendingConfirmation.onConfirm();
      setPendingConfirmation(null);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Gagal memperbarui Google Sheets.'
      );
    } finally {
      setConfirmBusy(false);
    }
  }, [pendingConfirmation]);

  const addBatch = useCallback(
    async (input: CreateBatchInput): Promise<{ ok: boolean; error?: string }> => {
      setErrorMessage(null);
      const token = getAccessToken();
      const activeSheet = sheetInfoRef.current;

      if (activeSheet && token) {
        return new Promise((resolve) => {
          setPendingConfirmation({
            title: 'Tambah Kandang Baru ke Google Sheets?',
            description: `Tambahkan "${input.penName}" (${input.count} ekor · ${input.breed} · ${input.phase}) ke spreadsheet "${activeSheet.title}"?`,
            confirmLabel: 'Simpan ke Sheets',
            onConfirm: async () => {
              const latest = await readBatchesFromSheet(
                activeSheet.spreadsheetId,
                activeSheet.activeSheetName,
                token
              );
              const baseList = latest.batches.length > 0 ? latest.batches : batchesRef.current;
              const now = new Date().toISOString();
              const newBatch: PigBatch = {
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
              const nextList = [newBatch, ...baseList];
              await writeAllBatchesToSheet(
                activeSheet.spreadsheetId,
                activeSheet.activeSheetName,
                token,
                nextList
              );
              const evt: PopulationEvent = {
                id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                type: 'create',
                penName: newBatch.penName,
                breed: newBatch.breed,
                phase: newBatch.phase,
                previousCount: null,
                newCount: newBatch.count,
                delta: newBatch.count,
                actor: newBatch.updatedBy,
                timestamp: now,
              };
              await appendSheetAuditEvent(
                activeSheet.spreadsheetId,
                activeSheet.sheetNames,
                token,
                evt
              ).catch(() => {});
              setBatches(nextList);
              pushEventIdempotent(evt);
              setLastSheetSyncAt(now);
              resolve({ ok: true });
            },
            onCancel: () => resolve({ ok: false }),
          });
        });
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

      const token = getAccessToken();
      const activeSheet = sheetInfoRef.current;

      if (activeSheet && token) {
        const previewCount =
          input.delta !== undefined
            ? Math.max(0, existingSnapshot.count + input.delta)
            : input.count !== undefined
              ? input.count
              : existingSnapshot.count;

        const changeSummary =
          input.delta !== undefined || input.count !== undefined
            ? `Jumlah ekor "${existingSnapshot.penName}" akan diperbarui menjadi ${previewCount} ekor (saat ini ${existingSnapshot.count} ekor)`
            : `Detail kandang "${existingSnapshot.penName}" akan diperbarui`;

        return new Promise((resolve) => {
          setPendingConfirmation({
            title: 'Perbarui Data di Google Sheets?',
            description: `${changeSummary} pada spreadsheet "${activeSheet.title}".`,
            confirmLabel: 'Simpan ke Sheets',
            onConfirm: async () => {
              // Read latest rows from Sheets first so concurrent deltas never overwrite each other
              const latest = await readBatchesFromSheet(
                activeSheet.spreadsheetId,
                activeSheet.activeSheetName,
                token
              );
              const baseList = latest.batches.length > 0 ? latest.batches : batchesRef.current;
              const target = baseList.find((b) => b.id === id) || existingSnapshot;

              const nextCount =
                input.delta !== undefined
                  ? Math.max(0, target.count + input.delta)
                  : input.count !== undefined
                    ? input.count
                    : target.count;

              const now = new Date().toISOString();
              const updated: PigBatch = {
                ...target,
                ...(input.penName !== undefined ? { penName: input.penName } : {}),
                ...(input.breed !== undefined ? { breed: input.breed } : {}),
                ...(input.phase !== undefined ? { phase: input.phase } : {}),
                ...(input.avgWeightKg !== undefined ? { avgWeightKg: input.avgWeightKg } : {}),
                ...(input.healthStatus !== undefined ? { healthStatus: input.healthStatus } : {}),
                ...(input.notes !== undefined ? { notes: input.notes } : {}),
                count: nextCount,
                updatedAt: now,
                updatedBy: input.actor || 'Petugas Kandang',
              };

              const nextList = baseList.map((b) => (b.id === id ? updated : b));
              await writeAllBatchesToSheet(
                activeSheet.spreadsheetId,
                activeSheet.activeSheetName,
                token,
                nextList
              );

              const evt: PopulationEvent = {
                id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                type: 'update',
                penName: updated.penName,
                breed: updated.breed,
                phase: updated.phase,
                previousCount: target.count,
                newCount: updated.count,
                delta: updated.count - target.count,
                actor: updated.updatedBy,
                timestamp: now,
              };
              await appendSheetAuditEvent(
                activeSheet.spreadsheetId,
                activeSheet.sheetNames,
                token,
                evt
              ).catch(() => {});

              setBatches(nextList);
              pushEventIdempotent(evt);
              setLastSheetSyncAt(now);
              resolve({ ok: true });
            },
            onCancel: () => resolve({ ok: false }),
          });
        });
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

      const token = getAccessToken();
      const activeSheet = sheetInfoRef.current;

      if (activeSheet && token) {
        return new Promise((resolve) => {
          setPendingConfirmation({
            title: 'Hapus Baris Kandang dari Google Sheets?',
            description: `Data "${target.penName}" (${target.count} ekor) akan dihapus permanen dari spreadsheet "${activeSheet.title}".`,
            confirmLabel: 'Ya, Hapus dari Sheets',
            isDestructive: true,
            onConfirm: async () => {
              const latest = await readBatchesFromSheet(
                activeSheet.spreadsheetId,
                activeSheet.activeSheetName,
                token
              );
              const baseList = latest.batches.length > 0 ? latest.batches : batchesRef.current;
              const nextList = baseList.filter((b) => b.id !== id);
              await writeAllBatchesToSheet(
                activeSheet.spreadsheetId,
                activeSheet.activeSheetName,
                token,
                nextList
              );
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
              await appendSheetAuditEvent(
                activeSheet.spreadsheetId,
                activeSheet.sheetNames,
                token,
                evt
              ).catch(() => {});
              setBatches(nextList);
              pushEventIdempotent(evt);
              setLastSheetSyncAt(now);
              resolve({ ok: true });
            },
            onCancel: () => resolve({ ok: false }),
          });
        });
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
    // Google Sheets & Auth props
    user,
    hasAccessToken,
    authBusy,
    unauthorizedDomain,
    dismissUnauthorizedDomain: () => setUnauthorizedDomain(null),
    sheetInfo,
    sheetBusy,
    lastSheetSyncAt,
    prefilledSheetId,
    pendingConfirmation,
    confirmBusy,
    cancelConfirmation: () => {
      if (!confirmBusy) {
        pendingConfirmation?.onCancel?.();
        setPendingConfirmation(null);
      }
    },
    proceedConfirmation,
    signInGoogle,
    signOutGoogle,
    createNewSheet,
    connectExistingSheet,
    changeActiveTab,
    syncSheetNow,
    disconnectSheet,
  };
}
