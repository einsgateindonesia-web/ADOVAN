import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDocFromServer,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  HEALTH_STATUSES,
  PIG_BREEDS,
  PIG_PHASES,
  type CreateBatchInput,
  type HealthStatus,
  type PigBatch,
  type PigBreed,
  type PigPhase,
  type PopulationEvent,
  type UpdateBatchInput,
} from '../types/population';
import { app, auth } from './firebaseAuth';

export const WORKSPACE_ID = 'bhumi-swana-main';
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

function makeDocId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toIsoString(val: unknown): string {
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (
    typeof val === 'object' &&
    val !== null &&
    'toDate' in val &&
    typeof (val as { toDate?: () => Date }).toDate === 'function'
  ) {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string' && val.length > 0) return val;
  return new Date().toISOString();
}

function sanitizeBreed(raw: unknown): PigBreed {
  return PIG_BREEDS.includes(raw as PigBreed) ? (raw as PigBreed) : 'Persilangan F1';
}

function sanitizePhase(raw: unknown): PigPhase {
  return PIG_PHASES.includes(raw as PigPhase) ? (raw as PigPhase) : 'Pembesaran';
}

function sanitizeHealth(raw: unknown): HealthStatus {
  return HEALTH_STATUSES.includes(raw as HealthStatus) ? (raw as HealthStatus) : 'Sehat';
}

function clampStr(val: unknown, maxLen: number, fallback = ''): string {
  const s = typeof val === 'string' ? val.trim() : fallback;
  return s.slice(0, maxLen);
}

function clampInt(val: unknown, min: number, max: number, fallback = 0): number {
  const n = typeof val === 'number' ? Math.round(val) : Number.parseInt(String(val ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampFloat(val: unknown, min: number, max: number, fallback = 0): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return fallback;
  const clamped = Math.min(max, Math.max(min, n));
  return Math.round(clamped * 10) / 10;
}

export function subscribeWorkspaceBatches(
  onData: (batches: PigBatch[]) => void,
  onError: (err: Error) => void
) {
  const path = 'batches';
  const q = query(collection(db, path), where('workspaceId', '==', WORKSPACE_ID));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: PigBatch[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          penName: clampStr(data.penName, 80, d.id),
          breed: sanitizeBreed(data.breed),
          phase: sanitizePhase(data.phase),
          count: clampInt(data.count, 0, 100000, 0),
          avgWeightKg: clampFloat(data.avgWeightKg, 0, 1000, 0),
          healthStatus: sanitizeHealth(data.healthStatus),
          notes: clampStr(data.notes, 200, ''),
          updatedAt: toIsoString(data.updatedAt),
          updatedBy: clampStr(data.updatedBy, 60, 'Petugas Kandang'),
        };
      });
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeWorkspaceEvents(
  onData: (events: PopulationEvent[]) => void,
  onError: (err: Error) => void
) {
  const path = 'events';
  const q = query(collection(db, path), where('workspaceId', '==', WORKSPACE_ID));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: PopulationEvent[] = snapshot.docs.map((d) => {
        const data = d.data();
        const type =
          data.type === 'create' || data.type === 'update' || data.type === 'delete'
            ? data.type
            : 'update';
        return {
          id: d.id,
          type,
          penName: clampStr(data.penName, 80, '-'),
          breed: clampStr(data.breed, 32, 'Persilangan F1'),
          phase: clampStr(data.phase, 32, 'Pembesaran'),
          previousCount:
            data.previousCount === null || data.previousCount === undefined
              ? null
              : clampInt(data.previousCount, 0, 100000, 0),
          newCount: clampInt(data.newCount, 0, 100000, 0),
          delta: clampInt(data.delta, -100000, 100000, 0),
          actor: clampStr(data.actor, 60, 'Petugas Kandang'),
          timestamp: toIsoString(data.timestamp),
        };
      });
      list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      onData(list.slice(0, 40));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function seedInitialBatchesIfEmpty(
  user: User,
  seedBatches: PigBatch[]
): Promise<void> {
  const path = 'batches';
  try {
    const q = query(collection(db, path), where('workspaceId', '==', WORKSPACE_ID), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) return;

    const batchWrite = writeBatch(db);
    for (const item of seedBatches) {
      const docId = item.id.replace(/[^a-zA-Z0-9_-]/g, '') || makeDocId('batch');
      const ref = doc(db, path, docId);
      batchWrite.set(ref, {
        workspaceId: WORKSPACE_ID,
        penName: clampStr(item.penName, 80, 'Kandang'),
        breed: sanitizeBreed(item.breed),
        phase: sanitizePhase(item.phase),
        count: clampInt(item.count, 0, 100000, 0),
        avgWeightKg: clampFloat(item.avgWeightKg, 0, 1000, 0),
        healthStatus: sanitizeHealth(item.healthStatus),
        notes: clampStr(item.notes, 200, ''),
        updatedBy: clampStr(item.updatedBy, 60, 'Petugas Kandang'),
        updatedByUid: user.uid,
        createdByUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batchWrite.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function createBatchInFirestore(
  user: User,
  input: CreateBatchInput
): Promise<PigBatch> {
  const batchId = makeDocId('batch');
  const eventId = makeDocId('evt');
  const batchPath = `batches/${batchId}`;
  const eventPath = `events/${eventId}`;

  const penName = clampStr(input.penName, 80, 'Kandang Baru');
  const breed = sanitizeBreed(input.breed);
  const phase = sanitizePhase(input.phase);
  const count = clampInt(input.count, 0, 100000, 0);
  const avgWeightKg = clampFloat(input.avgWeightKg, 0, 1000, 0);
  const healthStatus = sanitizeHealth(input.healthStatus);
  const notes = clampStr(input.notes, 200, '');
  const actor = clampStr(input.actor || user.displayName || 'Petugas Kandang', 60, 'Petugas Kandang');

  try {
    const wb = writeBatch(db);
    wb.set(doc(db, batchPath), {
      workspaceId: WORKSPACE_ID,
      penName,
      breed,
      phase,
      count,
      avgWeightKg,
      healthStatus,
      notes,
      updatedBy: actor,
      updatedByUid: user.uid,
      createdByUid: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    wb.set(doc(db, eventPath), {
      workspaceId: WORKSPACE_ID,
      type: 'create',
      batchId,
      penName,
      breed,
      phase,
      previousCount: null,
      newCount: count,
      delta: count,
      actor,
      actorUid: user.uid,
      timestamp: serverTimestamp(),
    });
    await wb.commit();
    return {
      id: batchId,
      penName,
      breed,
      phase,
      count,
      avgWeightKg,
      healthStatus,
      notes,
      updatedAt: new Date().toISOString(),
      updatedBy: actor,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, batchPath);
  }
}

export async function updateBatchInFirestore(
  user: User,
  id: string,
  input: UpdateBatchInput
): Promise<PigBatch> {
  const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  const batchPath = `batches/${cleanId}`;
  const eventId = makeDocId('evt');
  const eventPath = `events/${eventId}`;
  const actor = clampStr(input.actor || user.displayName || 'Petugas Kandang', 60, 'Petugas Kandang');

  try {
    return await runTransaction(db, async (tx) => {
      const batchRef = doc(db, batchPath);
      const snap = await tx.get(batchRef);
      if (!snap.exists()) {
        throw new Error('Data kandang tidak ditemukan di database.');
      }
      const existing = snap.data();
      const prevCount = clampInt(existing.count, 0, 100000, 0);
      const nextCount =
        input.delta !== undefined
          ? clampInt(prevCount + input.delta, 0, 100000, prevCount)
          : input.count !== undefined
            ? clampInt(input.count, 0, 100000, prevCount)
            : prevCount;

      const penName =
        input.penName !== undefined
          ? clampStr(input.penName, 80, String(existing.penName))
          : clampStr(existing.penName, 80, cleanId);
      const breed =
        input.breed !== undefined ? sanitizeBreed(input.breed) : sanitizeBreed(existing.breed);
      const phase =
        input.phase !== undefined ? sanitizePhase(input.phase) : sanitizePhase(existing.phase);
      const avgWeightKg =
        input.avgWeightKg !== undefined
          ? clampFloat(input.avgWeightKg, 0, 1000, Number(existing.avgWeightKg) || 0)
          : clampFloat(existing.avgWeightKg, 0, 1000, 0);
      const healthStatus =
        input.healthStatus !== undefined
          ? sanitizeHealth(input.healthStatus)
          : sanitizeHealth(existing.healthStatus);
      const notes =
        input.notes !== undefined
          ? clampStr(input.notes, 200, '')
          : clampStr(existing.notes, 200, '');

      const isQuickCountOnly =
        input.penName === undefined &&
        input.breed === undefined &&
        input.phase === undefined &&
        input.avgWeightKg === undefined &&
        input.healthStatus === undefined &&
        input.notes === undefined;

      if (isQuickCountOnly) {
        tx.update(batchRef, {
          count: nextCount,
          updatedBy: actor,
          updatedByUid: user.uid,
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.update(batchRef, {
          penName,
          breed,
          phase,
          count: nextCount,
          avgWeightKg,
          healthStatus,
          notes,
          updatedBy: actor,
          updatedByUid: user.uid,
          updatedAt: serverTimestamp(),
        });
      }

      tx.set(doc(db, eventPath), {
        workspaceId: WORKSPACE_ID,
        type: 'update',
        batchId: cleanId,
        penName,
        breed,
        phase,
        previousCount: prevCount,
        newCount: nextCount,
        delta: nextCount - prevCount,
        actor,
        actorUid: user.uid,
        timestamp: serverTimestamp(),
      });

      return {
        id: cleanId,
        penName,
        breed,
        phase,
        count: nextCount,
        avgWeightKg,
        healthStatus,
        notes,
        updatedAt: new Date().toISOString(),
        updatedBy: actor,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, batchPath);
  }
}

export async function deleteBatchInFirestore(
  user: User,
  id: string,
  actorInput: string
): Promise<void> {
  const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  const batchPath = `batches/${cleanId}`;
  const eventId = makeDocId('evt');
  const eventPath = `events/${eventId}`;
  const actor = clampStr(actorInput || user.displayName || 'Petugas Kandang', 60, 'Petugas Kandang');

  try {
    await runTransaction(db, async (tx) => {
      const batchRef = doc(db, batchPath);
      const snap = await tx.get(batchRef);
      if (!snap.exists()) return;
      const existing = snap.data();
      const prevCount = clampInt(existing.count, 0, 100000, 0);

      tx.delete(batchRef);
      tx.set(doc(db, eventPath), {
        workspaceId: WORKSPACE_ID,
        type: 'delete',
        batchId: cleanId,
        penName: clampStr(existing.penName, 80, cleanId),
        breed: clampStr(existing.breed, 32, 'Persilangan F1'),
        phase: clampStr(existing.phase, 32, 'Pembesaran'),
        previousCount: prevCount,
        newCount: 0,
        delta: -prevCount,
        actor,
        actorUid: user.uid,
        timestamp: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, batchPath);
  }
}

export async function saveInquiryInFirestore(
  user: User,
  payload: { name: string; contact: string; topic: string; message: string }
): Promise<void> {
  const inquiryId = makeDocId('inq');
  const path = `inquiries/${inquiryId}`;
  try {
    const wb = writeBatch(db);
    wb.set(doc(db, path), {
      name: clampStr(payload.name, 80, 'Tamu'),
      contact: clampStr(payload.contact, 100, '-'),
      topic: clampStr(payload.topic, 80, 'Kemitraan'),
      message: clampStr(payload.message, 1000, '-'),
      ownerId: user.uid,
      createdAt: serverTimestamp(),
    });
    await wb.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}
