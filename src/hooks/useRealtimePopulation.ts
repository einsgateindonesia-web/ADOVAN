import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CreateBatchInput,
  PigBatch,
  PopulationEvent,
  UpdateBatchInput,
} from '../types/population';

export type ConnectionState =
  | 'connecting'
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

export function useRealtimePopulation() {
  const [batches, setBatches] = useState<PigBatch[]>([]);
  const [events, setEvents] = useState<PopulationEvent[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [connectedClients, setConnectedClients] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const retryFetchTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const localModeRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);

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
    const localData = loadLocalStore();
    setBatches(localData.batches);
    setEvents(localData.events);
    setLoading(false);
    setErrorMessage(null);
    setConnectionState('local-sync');
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
    if (!mountedRef.current || localModeRef.current) return;
    if (sseRef.current) return;

    try {
      const es = new EventSource('/api/population/stream');
      sseRef.current = es;

      es.onopen = () => {
        if (!mountedRef.current) return;
        setConnectionState('connected');
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
      // EventSource unsupported or unavailable
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
        setConnectionState('connected');
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
        } else {
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
            // If static hosting returns index.html or 404 on /api/population
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
        setBatches(data.batches);
        setEvents(data.events);
        setConnectedClients(data.connectedClients || 1);
        setLoading(false);
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

  useEffect(() => {
    mountedRef.current = true;
    fetchSnapshot(0);

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      if (retryFetchTimerRef.current !== null) {
        window.clearTimeout(retryFetchTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (sseRef.current) {
        sseRef.current.close();
      }
      if (channelRef.current) {
        channelRef.current.close();
      }
    };
  }, [fetchSnapshot]);

  const addBatch = useCallback(
    async (input: CreateBatchInput): Promise<{ ok: boolean; error?: string }> => {
      setErrorMessage(null);

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
        const nextBatches = [batch, ...batches];
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
        if (data.event) {
          pushEventIdempotent(data.event);
        }
        return { ok: true };
      } catch {
        const msg = 'Koneksi terputus saat menyimpan data.';
        setErrorMessage(msg);
        return { ok: false, error: msg };
      }
    },
    [batches, events, pushEventIdempotent]
  );

  const updateBatch = useCallback(
    async (id: string, input: UpdateBatchInput): Promise<{ ok: boolean; error?: string }> => {
      setErrorMessage(null);
      const snapshot = batches;

      if (localModeRef.current) {
        const existing = batches.find((b) => b.id === id);
        if (!existing) return { ok: false, error: 'Data kandang tidak ditemukan.' };
        const now = new Date().toISOString();
        const updated: PigBatch = {
          ...existing,
          ...input,
          updatedAt: now,
          updatedBy: input.actor || 'Petugas Kandang',
        };
        const evt: PopulationEvent = {
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'update',
          penName: updated.penName,
          breed: updated.breed,
          phase: updated.phase,
          previousCount: existing.count,
          newCount: updated.count,
          delta: updated.count - existing.count,
          actor: updated.updatedBy,
          timestamp: now,
        };
        const nextBatches = batches.map((b) => (b.id === id ? updated : b));
        const nextEvents = [evt, ...events].slice(0, 40);
        setBatches(nextBatches);
        setEvents(nextEvents);
        saveLocalStore({ batches: nextBatches, events: nextEvents });
        channelRef.current?.postMessage({ type: 'population:updated', batch: updated, event: evt });
        return { ok: true };
      }

      setBatches((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                ...input,
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
        if (data.event) {
          pushEventIdempotent(data.event);
        }
        return { ok: true };
      } catch {
        setBatches(snapshot);
        const msg = 'Gagal menghubungi server untuk pembaruan.';
        setErrorMessage(msg);
        return { ok: false, error: msg };
      }
    },
    [batches, events, pushEventIdempotent]
  );

  const removeBatch = useCallback(
    async (id: string, actor: string): Promise<{ ok: boolean; error?: string }> => {
      setErrorMessage(null);
      const snapshot = batches;

      if (localModeRef.current) {
        const existing = batches.find((b) => b.id === id);
        if (!existing) return { ok: false, error: 'Data kandang tidak ditemukan.' };
        const now = new Date().toISOString();
        const evt: PopulationEvent = {
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'delete',
          penName: existing.penName,
          breed: existing.breed,
          phase: existing.phase,
          previousCount: existing.count,
          newCount: 0,
          delta: -existing.count,
          actor: actor || 'Petugas Kandang',
          timestamp: now,
        };
        const nextBatches = batches.filter((b) => b.id !== id);
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
        if (data.event) {
          pushEventIdempotent(data.event);
        }
        return { ok: true };
      } catch {
        setBatches(snapshot);
        const msg = 'Koneksi terputus saat menghapus data.';
        setErrorMessage(msg);
        return { ok: false, error: msg };
      }
    },
    [batches, events, pushEventIdempotent]
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
  };
}
