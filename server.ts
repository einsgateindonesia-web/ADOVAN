import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type PigBreed = 'Landrace' | 'Yorkshire' | 'Duroc' | 'Persilangan F1';
type PigPhase =
  | 'Anak Babi'
  | 'Sapihan'
  | 'Pembesaran'
  | 'Penggemukan'
  | 'Indukan'
  | 'Pejantan';
type HealthStatus = 'Sehat' | 'Pantauan' | 'Karantina' | 'Siap Panen';

interface PigBatch {
  id: string;
  penName: string;
  breed: PigBreed;
  phase: PigPhase;
  count: number;
  avgWeightKg: number;
  healthStatus: HealthStatus;
  notes: string;
  updatedAt: string;
  updatedBy: string;
}

interface PopulationEvent {
  id: string;
  type: 'create' | 'update' | 'delete';
  penName: string;
  breed: string;
  phase: string;
  previousCount: number | null;
  newCount: number;
  delta: number;
  actor: string;
  timestamp: string;
}

interface PopulationStore {
  batches: PigBatch[];
  events: PopulationEvent[];
}

interface InquiryRecord {
  id: string;
  name: string;
  contact: string;
  topic: string;
  message: string;
  createdAt: string;
}

const VALID_BREEDS: PigBreed[] = ['Landrace', 'Yorkshire', 'Duroc', 'Persilangan F1'];
const VALID_PHASES: PigPhase[] = [
  'Anak Babi',
  'Sapihan',
  'Pembesaran',
  'Penggemukan',
  'Indukan',
  'Pejantan',
];
const VALID_HEALTH: HealthStatus[] = ['Sehat', 'Pantauan', 'Karantina', 'Siap Panen'];

const DATA_DIR = path.resolve(__dirname, 'data');
const POPULATION_FILE = path.join(DATA_DIR, 'population.json');
const INQUIRIES_FILE = path.join(DATA_DIR, 'inquiries.json');

function createSeedStore(): PopulationStore {
  const now = Date.now();
  const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

  const batches: PigBatch[] = [
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
  ];

  const events: PopulationEvent[] = [
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
    {
      id: 'evt-seed-3',
      type: 'create',
      penName: 'Kandang B2 · Sapihan Awal',
      breed: 'Yorkshire',
      phase: 'Sapihan',
      previousCount: null,
      newCount: 142,
      delta: 142,
      actor: 'Operator Blok B',
      timestamp: iso(18),
    },
  ];

  return { batches, events };
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadStore(): PopulationStore {
  ensureDataDir();
  if (!fs.existsSync(POPULATION_FILE)) {
    const seed = createSeedStore();
    fs.writeFileSync(POPULATION_FILE, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
  try {
    const raw = fs.readFileSync(POPULATION_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as PopulationStore;
    if (Array.isArray(parsed.batches) && Array.isArray(parsed.events)) {
      return parsed;
    }
  } catch {
    // Fall back to seed if file is corrupted
  }
  const seed = createSeedStore();
  fs.writeFileSync(POPULATION_FILE, JSON.stringify(seed, null, 2), 'utf-8');
  return seed;
}

function saveStore(store: PopulationStore): void {
  ensureDataDir();
  fs.writeFileSync(POPULATION_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

function saveInquiry(inquiry: InquiryRecord): void {
  ensureDataDir();
  let current: InquiryRecord[] = [];
  if (fs.existsSync(INQUIRIES_FILE)) {
    try {
      const raw = fs.readFileSync(INQUIRIES_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) current = parsed;
    } catch {
      current = [];
    }
  }
  current.unshift(inquiry);
  fs.writeFileSync(INQUIRIES_FILE, JSON.stringify(current.slice(0, 200), null, 2), 'utf-8');
}

function sanitizeText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  const store = loadStore();

  const getConnectedCount = () => {
    let count = 0;
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) count += 1;
    });
    return count;
  };

  const broadcast = (payload: Record<string, unknown>) => {
    const encoded = JSON.stringify({
      ...payload,
      connectedClients: getConnectedCount(),
    });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(encoded);
      }
    });
  };

  const createBatch = (input: Record<string, unknown>): { batch?: PigBatch; event?: PopulationEvent; error?: string } => {
    const penName = sanitizeText(input.penName, 80);
    const breed = input.breed as PigBreed;
    const phase = input.phase as PigPhase;
    const healthStatus = (VALID_HEALTH.includes(input.healthStatus as HealthStatus)
      ? input.healthStatus
      : 'Sehat') as HealthStatus;
    const count = Number(input.count);
    const avgWeightKg = Number(input.avgWeightKg);
    const notes = sanitizeText(input.notes, 200);
    const actor = sanitizeText(input.actor, 40) || 'Peternak Aktif';

    if (!penName) {
      return { error: 'Nama kandang atau blok wajib diisi.' };
    }
    if (!VALID_BREEDS.includes(breed)) {
      return { error: 'Jenis ras babi tidak valid.' };
    }
    if (!VALID_PHASES.includes(phase)) {
      return { error: 'Fase pertumbuhan tidak valid.' };
    }
    if (!Number.isInteger(count) || count < 0 || count > 100_000) {
      return { error: 'Jumlah ekor harus berupa bilangan bulat antara 0 dan 100.000.' };
    }
    if (!Number.isFinite(avgWeightKg) || avgWeightKg < 0 || avgWeightKg > 1000) {
      return { error: 'Berat rata-rata harus di antara 0 hingga 1.000 kg.' };
    }

    const now = new Date().toISOString();
    const batch: PigBatch = {
      id: makeId('batch'),
      penName,
      breed,
      phase,
      count,
      avgWeightKg: Math.round(avgWeightKg * 10) / 10,
      healthStatus,
      notes,
      updatedAt: now,
      updatedBy: actor,
    };

    const event: PopulationEvent = {
      id: makeId('evt'),
      type: 'create',
      penName: batch.penName,
      breed: batch.breed,
      phase: batch.phase,
      previousCount: null,
      newCount: batch.count,
      delta: batch.count,
      actor,
      timestamp: now,
    };

    store.batches.unshift(batch);
    store.events.unshift(event);
    store.events = store.events.slice(0, 40);
    saveStore(store);

    return { batch, event };
  };

  const updateBatch = (
    id: string,
    input: Record<string, unknown>
  ): { batch?: PigBatch; event?: PopulationEvent; error?: string; status?: number } => {
    const idx = store.batches.findIndex((b) => b.id === id);
    if (idx === -1) {
      return { error: 'Data kandang tidak ditemukan.', status: 404 };
    }

    const existing = store.batches[idx];
    const actor = sanitizeText(input.actor, 40) || 'Peternak Aktif';
    const nextCount = input.count !== undefined ? Number(input.count) : existing.count;
    const nextWeight =
      input.avgWeightKg !== undefined ? Number(input.avgWeightKg) : existing.avgWeightKg;
    const nextPenName =
      input.penName !== undefined ? sanitizeText(input.penName, 80) : existing.penName;
    const nextBreed =
      input.breed !== undefined && VALID_BREEDS.includes(input.breed as PigBreed)
        ? (input.breed as PigBreed)
        : existing.breed;
    const nextPhase =
      input.phase !== undefined && VALID_PHASES.includes(input.phase as PigPhase)
        ? (input.phase as PigPhase)
        : existing.phase;
    const nextHealth =
      input.healthStatus !== undefined && VALID_HEALTH.includes(input.healthStatus as HealthStatus)
        ? (input.healthStatus as HealthStatus)
        : existing.healthStatus;
    const nextNotes =
      input.notes !== undefined ? sanitizeText(input.notes, 200) : existing.notes;

    if (!nextPenName) {
      return { error: 'Nama kandang tidak boleh kosong.', status: 400 };
    }
    if (!Number.isInteger(nextCount) || nextCount < 0 || nextCount > 100_000) {
      return { error: 'Jumlah ekor harus bilangan bulat 0 hingga 100.000.', status: 400 };
    }
    if (!Number.isFinite(nextWeight) || nextWeight < 0 || nextWeight > 1000) {
      return { error: 'Berat rata-rata tidak valid.', status: 400 };
    }

    const now = new Date().toISOString();
    const updated: PigBatch = {
      ...existing,
      penName: nextPenName,
      breed: nextBreed,
      phase: nextPhase,
      count: nextCount,
      avgWeightKg: Math.round(nextWeight * 10) / 10,
      healthStatus: nextHealth,
      notes: nextNotes,
      updatedAt: now,
      updatedBy: actor,
    };

    store.batches[idx] = updated;

    const event: PopulationEvent = {
      id: makeId('evt'),
      type: 'update',
      penName: updated.penName,
      breed: updated.breed,
      phase: updated.phase,
      previousCount: existing.count,
      newCount: updated.count,
      delta: updated.count - existing.count,
      actor,
      timestamp: now,
    };

    store.events.unshift(event);
    store.events = store.events.slice(0, 40);
    saveStore(store);

    return { batch: updated, event };
  };

  const deleteBatch = (
    id: string,
    actorInput?: unknown
  ): { deleted?: PigBatch; event?: PopulationEvent; error?: string } => {
    const idx = store.batches.findIndex((b) => b.id === id);
    if (idx === -1) {
      return { error: 'Data kandang tidak ditemukan.' };
    }

    const [removed] = store.batches.splice(idx, 1);
    const actor = sanitizeText(actorInput, 40) || 'Peternak Aktif';
    const now = new Date().toISOString();

    const event: PopulationEvent = {
      id: makeId('evt'),
      type: 'delete',
      penName: removed.penName,
      breed: removed.breed,
      phase: removed.phase,
      previousCount: removed.count,
      newCount: 0,
      delta: -removed.count,
      actor,
      timestamp: now,
    };

    store.events.unshift(event);
    store.events = store.events.slice(0, 40);
    saveStore(store);

    return { deleted: removed, event };
  };

  wss.on('connection', (ws) => {
    ws.send(
      JSON.stringify({
        type: 'population:init',
        batches: store.batches,
        events: store.events,
        connectedClients: getConnectedCount(),
      })
    );

    broadcast({ type: 'presence:update' });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          id?: string;
          payload?: Record<string, unknown>;
        };
        if (!msg || typeof msg.type !== 'string') return;

        if (msg.type === 'batch:create' && msg.payload) {
          const result = createBatch(msg.payload);
          if (result.error) {
            ws.send(JSON.stringify({ type: 'population:error', error: result.error }));
            return;
          }
          broadcast({
            type: 'population:created',
            batch: result.batch,
            event: result.event,
          });
        } else if (msg.type === 'batch:update' && msg.id && msg.payload) {
          const result = updateBatch(msg.id, msg.payload);
          if (result.error) {
            ws.send(JSON.stringify({ type: 'population:error', error: result.error }));
            return;
          }
          broadcast({
            type: 'population:updated',
            batch: result.batch,
            event: result.event,
          });
        } else if (msg.type === 'batch:delete' && msg.id) {
          const result = deleteBatch(msg.id, msg.payload?.actor);
          if (result.error) {
            ws.send(JSON.stringify({ type: 'population:error', error: result.error }));
            return;
          }
          broadcast({
            type: 'population:deleted',
            id: msg.id,
            event: result.event,
          });
        }
      } catch {
        ws.send(JSON.stringify({ type: 'population:error', error: 'Format pesan tidak valid.' }));
      }
    });

    ws.on('close', () => {
      broadcast({ type: 'presence:update' });
    });
  });

  app.get('/api/population', (_req, res) => {
    res.json({
      batches: store.batches,
      events: store.events,
      connectedClients: getConnectedCount(),
      lastSyncedAt: new Date().toISOString(),
    });
  });

  app.post('/api/population', (req, res) => {
    const result = createBatch(req.body ?? {});
    if (result.error || !result.batch || !result.event) {
      res.status(400).json({ error: result.error || 'Gagal menambahkan data populasi.' });
      return;
    }
    broadcast({
      type: 'population:created',
      batch: result.batch,
      event: result.event,
    });
    res.status(201).json({ batch: result.batch, event: result.event });
  });

  app.patch('/api/population/:id', (req, res) => {
    const result = updateBatch(req.params.id, req.body ?? {});
    if (result.error || !result.batch || !result.event) {
      res.status(result.status || 400).json({ error: result.error || 'Gagal memperbarui populasi.' });
      return;
    }
    broadcast({
      type: 'population:updated',
      batch: result.batch,
      event: result.event,
    });
    res.json({ batch: result.batch, event: result.event });
  });

  app.delete('/api/population/:id', (req, res) => {
    const actor = req.query.actor ?? req.body?.actor;
    const result = deleteBatch(req.params.id, actor);
    if (result.error || !result.event) {
      res.status(404).json({ error: result.error || 'Data kandang tidak ditemukan.' });
      return;
    }
    broadcast({
      type: 'population:deleted',
      id: req.params.id,
      event: result.event,
    });
    res.json({ ok: true, id: req.params.id, event: result.event });
  });

  app.post('/api/inquiries', (req, res) => {
    const name = sanitizeText(req.body?.name, 80);
    const contact = sanitizeText(req.body?.contact, 80);
    const topic = sanitizeText(req.body?.topic, 60) || 'Kemitraan Pembibitan';
    const message = sanitizeText(req.body?.message, 600);

    if (name.length < 2) {
      res.status(400).json({ error: 'Nama lengkap minimal 2 karakter.' });
      return;
    }
    if (contact.length < 5) {
      res.status(400).json({ error: 'Masukkan nomor WhatsApp atau email yang valid.' });
      return;
    }
    if (message.length < 8) {
      res.status(400).json({ error: 'Tuliskan rincian kebutuhan Anda minimal 8 karakter.' });
      return;
    }

    const inquiry: InquiryRecord = {
      id: makeId('inq'),
      name,
      contact,
      topic,
      message,
      createdAt: new Date().toISOString(),
    };
    saveInquiry(inquiry);
    res.status(201).json({ ok: true, inquiry });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Bhumi Swana server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
