import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CreateBatchInput,
  PigBatch,
  PopulationEvent,
  UpdateBatchInput,
} from '../types/population';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'error';

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

export function useRealtimePopulation() {
  const [batches, setBatches] = useState<PigBatch[]>([]);
  const [events, setEvents] = useState<PopulationEvent[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [connectedClients, setConnectedClients] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const mountedRef = useRef<boolean>(true);

  const pushEventIdempotent = useCallback((evt?: PopulationEvent) => {
    if (!evt) return;
    setEvents((prev) => {
      if (prev.some((item) => item.id === evt.id)) return prev;
      return [evt, ...prev].slice(0, 40);
    });
  }, []);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch('/api/population');
      if (!res.ok) throw new Error('Gagal memuat data populasi.');
      const data = (await res.json()) as {
        batches: PigBatch[];
        events: PopulationEvent[];
        connectedClients: number;
      };
      if (!mountedRef.current) return;
      setBatches(data.batches);
      setEvents(data.events);
      setConnectedClients(data.connectedClients || 1);
      setLoading(false);
    } catch {
      if (!mountedRef.current) return;
      setErrorMessage('Tidak dapat terhubung ke server populasi.');
      setLoading(false);
    }
  }, []);

  const connectWs = useCallback(() => {
    if (!mountedRef.current) return;
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
      };

      socket.onmessage = (messageEvent) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(messageEvent.data) as WsServerMessage;
          if (typeof msg.connectedClients === 'number') {
            setConnectedClients(Math.max(1, msg.connectedClients));
          }

          if (msg.type === 'population:init') {
            if (Array.isArray(msg.batches)) setBatches(msg.batches);
            if (Array.isArray(msg.events)) setEvents(msg.events);
            setLoading(false);
          } else if (msg.type === 'population:created' && msg.batch) {
            const incoming = msg.batch;
            setBatches((prev) => {
              if (prev.some((b) => b.id === incoming.id)) return prev;
              return [incoming, ...prev];
            });
            pushEventIdempotent(msg.event);
          } else if (msg.type === 'population:updated' && msg.batch) {
            const incoming = msg.batch;
            setBatches((prev) =>
              prev.map((b) => (b.id === incoming.id ? incoming : b))
            );
            pushEventIdempotent(msg.event);
          } else if (msg.type === 'population:deleted' && msg.id) {
            const deletedId = msg.id;
            setBatches((prev) => prev.filter((b) => b.id !== deletedId));
            pushEventIdempotent(msg.event);
          } else if (msg.type === 'population:error' && msg.error) {
            setErrorMessage(msg.error);
          }
        } catch {
          // Ignore malformed frame
        }
      };

      socket.onclose = () => {
        if (!mountedRef.current) return;
        setConnectionState('reconnecting');
        const attempt = reconnectAttemptRef.current;
        const delay = Math.min(5000, 800 * Math.pow(1.6, attempt));
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(() => {
          connectWs();
        }, delay);
      };

      socket.onerror = () => {
        if (!mountedRef.current) return;
        setConnectionState('reconnecting');
      };
    } catch {
      setConnectionState('error');
    }
  }, [pushEventIdempotent]);

  useEffect(() => {
    mountedRef.current = true;
    fetchSnapshot();
    connectWs();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWs, fetchSnapshot]);

  const addBatch = useCallback(async (input: CreateBatchInput): Promise<{ ok: boolean; error?: string }> => {
    setErrorMessage(null);
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
  }, [pushEventIdempotent]);

  const updateBatch = useCallback(
    async (id: string, input: UpdateBatchInput): Promise<{ ok: boolean; error?: string }> => {
      setErrorMessage(null);
      const snapshot = batches;

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
          setBatches((prev) =>
            prev.map((b) => (b.id === data.batch.id ? data.batch : b))
          );
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
    [batches, pushEventIdempotent]
  );

  const removeBatch = useCallback(
    async (id: string, actor: string): Promise<{ ok: boolean; error?: string }> => {
      setErrorMessage(null);
      const snapshot = batches;
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
    [batches, pushEventIdempotent]
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
