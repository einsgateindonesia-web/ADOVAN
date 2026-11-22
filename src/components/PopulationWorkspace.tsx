import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Activity,
  AlertCircle,
  Check,
  Edit3,
  Minus,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { ConnectionState } from '../hooks/useRealtimePopulation';
import type { SpreadsheetInfo } from '../lib/googleSheets';
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
import {
  ConfirmMutationModal,
  type PendingSheetConfirmation,
} from './ConfirmMutationModal';
import { GoogleSheetsBar } from './GoogleSheetsBar';

interface PopulationWorkspaceProps {
  batches: PigBatch[];
  events: PopulationEvent[];
  connectionState: ConnectionState;
  connectedClients: number;
  loading: boolean;
  errorMessage: string | null;
  onClearError: () => void;
  onAddBatch: (input: CreateBatchInput) => Promise<{ ok: boolean; error?: string }>;
  onUpdateBatch: (
    id: string,
    input: UpdateBatchInput
  ) => Promise<{ ok: boolean; error?: string }>;
  onRemoveBatch: (id: string, actor: string) => Promise<{ ok: boolean; error?: string }>;
  // Google Sheets props
  user: User | null;
  hasAccessToken: boolean;
  authBusy: boolean;
  unauthorizedDomain: string | null;
  onDismissUnauthorizedDomain: () => void;
  sheetInfo: SpreadsheetInfo | null;
  sheetBusy: boolean;
  lastSheetSyncAt: string | null;
  prefilledSheetId: string;
  pendingConfirmation: PendingSheetConfirmation | null;
  confirmBusy: boolean;
  onCancelConfirmation: () => void;
  onProceedConfirmation: () => void;
  onSignInGoogle: () => Promise<void>;
  onSignOutGoogle: () => Promise<void>;
  onCreateNewSheet: () => Promise<void>;
  onConnectExistingSheet: (urlOrId: string) => Promise<void>;
  onChangeActiveTab: (tabName: string) => Promise<void>;
  onSyncSheetNow: () => Promise<void>;
  onDisconnectSheet: () => void;
}

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '--:--';
  }
}

export function PopulationWorkspace({
  batches,
  events,
  connectionState,
  connectedClients,
  loading,
  errorMessage,
  onClearError,
  onAddBatch,
  onUpdateBatch,
  onRemoveBatch,
  user,
  hasAccessToken,
  authBusy,
  unauthorizedDomain,
  onDismissUnauthorizedDomain,
  sheetInfo,
  sheetBusy,
  lastSheetSyncAt,
  prefilledSheetId,
  pendingConfirmation,
  confirmBusy,
  onCancelConfirmation,
  onProceedConfirmation,
  onSignInGoogle,
  onSignOutGoogle,
  onCreateNewSheet,
  onConnectExistingSheet,
  onChangeActiveTab,
  onSyncSheetNow,
  onDisconnectSheet,
}: PopulationWorkspaceProps) {
  const [actorName, setActorName] = useState<string>('Petugas Kandang');
  const [phaseFilter, setPhaseFilter] = useState<'Semua' | PigPhase>('Semua');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Create form state
  const [penName, setPenName] = useState<string>('');
  const [breed, setBreed] = useState<PigBreed>('Persilangan F1');
  const [phase, setPhase] = useState<PigPhase>('Pembesaran');
  const [countInput, setCountInput] = useState<string>('45');
  const [weightInput, setWeightInput] = useState<string>('32.5');
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('Sehat');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formFeedback, setFormFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Per-row quick count draft & editing state (auto-synced with remote updates)
  const [countDrafts, setCountDrafts] = useState<Record<string, string>>({});
  const focusedCountIdRef = useRef<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    phase: PigPhase;
    avgWeightKg: string;
    healthStatus: HealthStatus;
    notes: string;
  } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Keep every non-focused row count synchronized with the authoritative state
  useEffect(() => {
    setCountDrafts((prev) => {
      const next: Record<string, string> = {};
      for (const b of batches) {
        if (focusedCountIdRef.current === b.id && prev[b.id] !== undefined) {
          next[b.id] = prev[b.id];
        } else {
          next[b.id] = String(b.count);
        }
      }
      return next;
    });
  }, [batches]);

  const filteredBatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return batches.filter((item) => {
      if (phaseFilter !== 'Semua' && item.phase !== phaseFilter) return false;
      if (!q) return true;
      return (
        item.penName.toLowerCase().includes(q) ||
        item.breed.toLowerCase().includes(q) ||
        item.phase.toLowerCase().includes(q) ||
        item.notes.toLowerCase().includes(q)
      );
    });
  }, [batches, phaseFilter, searchQuery]);

  const filteredTotal = useMemo(
    () => filteredBatches.reduce((sum, b) => sum + b.count, 0),
    [filteredBatches]
  );

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);
    const trimmedPen = penName.trim();
    const parsedCount = Number(countInput);
    const parsedWeight = Number(weightInput);

    if (!trimmedPen) {
      setFormFeedback({ type: 'error', text: 'Nama kandang wajib diisi.' });
      return;
    }
    if (!Number.isInteger(parsedCount) || parsedCount < 0) {
      setFormFeedback({ type: 'error', text: 'Jumlah ekor harus bilangan bulat 0 atau lebih.' });
      return;
    }
    if (!Number.isFinite(parsedWeight) || parsedWeight < 0) {
      setFormFeedback({ type: 'error', text: 'Berat rata-rata tidak valid.' });
      return;
    }

    setSubmitting(true);
    const res = await onAddBatch({
      penName: trimmedPen,
      breed,
      phase,
      count: parsedCount,
      avgWeightKg: parsedWeight,
      healthStatus,
      notes: notes.trim(),
      actor: user?.displayName || actorName.trim() || 'Petugas Kandang',
    });
    setSubmitting(false);

    if (!res.ok) {
      if (res.error) {
        setFormFeedback({ type: 'error', text: res.error });
      }
      return;
    }

    setPenName('');
    setNotes('');
    setFormFeedback({
      type: 'success',
      text: `Data "${trimmedPen}" berhasil ditambahkan dan disinkronkan.`,
    });
  };

  const handleQuickDelta = async (batch: PigBatch, delta: number) => {
    if (batch.count + delta < 0 && batch.count === 0) return;
    focusedCountIdRef.current = null;
    await onUpdateBatch(batch.id, {
      delta,
      actor: user?.displayName || actorName.trim() || 'Petugas Kandang',
    });
  };

  const handleDirectCountSave = async (batch: PigBatch) => {
    const raw = countDrafts[batch.id];
    if (raw === undefined) return;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100_000) return;
    focusedCountIdRef.current = null;
    await onUpdateBatch(batch.id, {
      count: parsed,
      actor: user?.displayName || actorName.trim() || 'Petugas Kandang',
    });
  };

  const openEdit = (batch: PigBatch) => {
    setEditingId(batch.id);
    setEditDraft({
      phase: batch.phase,
      avgWeightKg: String(batch.avgWeightKg),
      healthStatus: batch.healthStatus,
      notes: batch.notes,
    });
  };

  const handleEditSave = async (batchId: string) => {
    if (!editDraft) return;
    const parsedWeight = Number(editDraft.avgWeightKg);
    if (!Number.isFinite(parsedWeight) || parsedWeight < 0) return;
    const res = await onUpdateBatch(batchId, {
      phase: editDraft.phase,
      avgWeightKg: parsedWeight,
      healthStatus: editDraft.healthStatus,
      notes: editDraft.notes.trim(),
      actor: user?.displayName || actorName.trim() || 'Petugas Kandang',
    });
    if (res.ok) {
      setEditingId(null);
      setEditDraft(null);
    }
  };

  const connectionLabel =
    connectionState === 'sheets-synced'
      ? 'Sinkronisasi Google Sheets Aktif'
      : connectionState === 'connected'
        ? 'Sinkronisasi Real-Time Aktif'
        : connectionState === 'local-sync'
          ? 'Sinkronisasi Tab Aktif'
          : connectionState === 'reconnecting'
            ? 'Menghubungkan Ulang...'
            : 'Menghubungkan ke Server...';

  return (
    <section id="populasi" className="py-20 border-t border-slate-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header + live telemetry bar */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 pb-8 border-b border-slate-200">
          <div className="max-w-2xl">
            <p className="text-xs font-medium tracking-wide text-[#164E38] mb-2">
              01 · Sistem Pencatatan Populasi Kandang
            </p>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 text-balance">
              Input &amp; Update Populasi Babi Secara Real-Time
            </h2>
            <p className="mt-3 text-base text-slate-600 leading-relaxed">
              Setiap penambahan kandang baru atau penyesuaian jumlah ekor langsung tersinkron
              otomatis antar perangkat dan dapat dihubungkan ke Google Sheets bersama.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-[#F8F9FA] text-xs font-medium text-slate-700 whitespace-nowrap shrink-0">
              <span
                className={`w-2 h-2 rounded-full ${
                  connectionState === 'connected' ||
                  connectionState === 'sheets-synced' ||
                  connectionState === 'local-sync'
                    ? 'bg-emerald-600'
                    : 'bg-amber-500 animate-pulse'
                }`}
                aria-hidden="true"
              />
              <span>{connectionLabel}</span>
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
              <span className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-600">
                <Users className="w-3.5 h-3.5" aria-hidden="true" />
                {connectedClients} aktif
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="actor-name" className="text-xs font-medium text-slate-500 whitespace-nowrap">
                Petugas:
              </label>
              <input
                id="actor-name"
                type="text"
                value={actorName}
                onChange={(e) => setActorName(e.target.value)}
                maxLength={40}
                placeholder="Nama petugas"
                className="w-40 px-3 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#164E38]/30 focus:border-[#164E38]"
              />
            </div>
          </div>
        </div>

        {/* Google Sheets Sync Bar */}
        <GoogleSheetsBar
          batches={batches}
          user={user}
          hasAccessToken={hasAccessToken}
          authBusy={authBusy}
          unauthorizedDomain={unauthorizedDomain}
          onDismissUnauthorizedDomain={onDismissUnauthorizedDomain}
          sheetInfo={sheetInfo}
          sheetBusy={sheetBusy}
          lastSheetSyncAt={lastSheetSyncAt}
          prefilledSheetId={prefilledSheetId}
          onSignIn={onSignInGoogle}
          onSignOut={onSignOutGoogle}
          onCreateSpreadsheet={onCreateNewSheet}
          onConnectSpreadsheet={onConnectExistingSheet}
          onChangeActiveTab={onChangeActiveTab}
          onSyncNow={onSyncSheetNow}
          onDisconnectSheet={onDisconnectSheet}
        />

        {errorMessage && (
          <div
            role="alert"
            className="mt-6 flex items-center justify-between gap-4 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={onClearError}
              className="text-xs font-medium underline hover:no-underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Main 12-column workspace */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left column: Input Populasi Baru */}
          <div className="lg:col-span-4 border border-slate-200 rounded-xl bg-[#F8F9FA] p-6">
            <h3 className="text-lg font-semibold text-slate-900">Input Batch Populasi Baru</h3>
            <p className="mt-1 text-xs text-slate-600">
              Tambahkan blok kandang atau kelompok ternak baru ke pencatatan aktif.
            </p>

            <form onSubmit={handleCreateSubmit} className="mt-5 space-y-4">
              <div>
                <label htmlFor="pen-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Nama Kandang / Blok
                </label>
                <input
                  id="pen-name"
                  type="text"
                  value={penName}
                  onChange={(e) => setPenName(e.target.value)}
                  placeholder="Contoh: Kandang E1 · Pembesaran"
                  maxLength={80}
                  required
                  className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#164E38]/30 focus:border-[#164E38]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pig-breed" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Jenis / Ras
                  </label>
                  <select
                    id="pig-breed"
                    value={breed}
                    onChange={(e) => setBreed(e.target.value as PigBreed)}
                    className="w-full px-3 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#164E38]/30 focus:border-[#164E38]"
                  >
                    {PIG_BREEDS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="pig-phase" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Fase Ternak
                  </label>
                  <select
                    id="pig-phase"
                    value={phase}
                    onChange={(e) => setPhase(e.target.value as PigPhase)}
                    className="w-full px-3 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#164E38]/30 focus:border-[#164E38]"
                  >
                    {PIG_PHASES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pig-count" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Jumlah Ekor
                  </label>
                  <input
                    id="pig-count"
                    type="number"
                    min={0}
                    max={100000}
                    step={1}
                    value={countInput}
                    onChange={(e) => setCountInput(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#164E38]/30 focus:border-[#164E38]"
                  />
                </div>

                <div>
                  <label htmlFor="pig-weight" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Bobot Rata-Rata (kg)
                  </label>
                  <input
                    id="pig-weight"
                    type="number"
                    min={0}
                    max={1000}
                    step="0.1"
                    value={weightInput}
                    onChange={(e) => setWeightInput(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#164E38]/30 focus:border-[#164E38]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="health-status" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Kondisi Kesehatan
                </label>
                <select
                  id="health-status"
                  value={healthStatus}
                  onChange={(e) => setHealthStatus(e.target.value as HealthStatus)}
                  className="w-full px-3 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#164E38]/30 focus:border-[#164E38]"
                >
                  {HEALTH_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="batch-notes" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Catatan Pakan / Medis (Opsional)
                </label>
                <textarea
                  id="batch-notes"
                  rows={2}
                  maxLength={200}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Contoh: Vaksinasi PCV2 selesai, ransum grower 2.1 kg/ekor."
                  className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#164E38]/30 focus:border-[#164E38]"
                />
              </div>

              {formFeedback && (
                <p
                  className={`text-xs font-medium px-3 py-2 rounded-lg border ${
                    formFeedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  {formFeedback.text}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 bg-[#164E38] hover:bg-[#113D2B] disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                {submitting ? 'Menyimpan...' : 'Simpan Populasi Baru'}
              </button>
            </form>
          </div>

          {/* Right column: Live filterable kandang list & real-time activity feed */}
          <div className="lg:col-span-8 space-y-6">
            {/* Filter bar + Search */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  {(['Semua', ...PIG_PHASES] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setPhaseFilter(tab)}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        phaseFilter === tab
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-56 shrink-0">
                  <Search
                    className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari kandang atau ras..."
                    aria-label="Cari kandang atau ras"
                    className="w-full pl-9 pr-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#164E38]/30 focus:border-[#164E38]"
                  />
                </div>
              </div>
            </div>

            {/* Summary inline line */}
            <div className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-200 pb-3">
              <span>
                Menampilkan{' '}
                <strong className="text-slate-900 font-mono tabular-nums">
                  {filteredBatches.length}
                </strong>{' '}
                blok kandang
              </span>
              <span>
                Subtotal filter:{' '}
                <strong className="text-slate-900 font-mono tabular-nums">
                  {filteredTotal.toLocaleString('id-ID')} ekor
                </strong>
              </span>
            </div>

            {/* Batch list */}
            {loading ? (
              <div className="py-16 text-center text-sm text-slate-500 border border-slate-200 rounded-xl">
                Memuat data populasi kandang...
              </div>
            ) : filteredBatches.length === 0 ? (
              <div className="py-14 px-6 text-center border border-slate-200 rounded-xl bg-[#F8F9FA]">
                <p className="text-sm font-medium text-slate-800">
                  Belum ada data kandang untuk filter ini.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Ubah filter fase atau tambahkan batch populasi baru melalui formulir di samping.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl bg-white">
                {filteredBatches.map((batch) => {
                  const draftValue = countDrafts[batch.id] ?? String(batch.count);
                  const draftDirty = Number(draftValue) !== batch.count;
                  const isEditing = editingId === batch.id && editDraft !== null;
                  const isConfirmDelete = confirmDeleteId === batch.id;

                  return (
                    <div key={batch.id} className="p-5 transition-colors hover:bg-slate-50/60">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        {/* Left: Pen info & clean unboxed metadata */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1 flex-wrap">
                            <span className="font-medium text-slate-700">{batch.breed}</span>
                            <span aria-hidden="true">·</span>
                            <span>{batch.phase}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{batch.avgWeightKg} kg/ekor</span>
                            <span aria-hidden="true">·</span>
                            <span
                              className={
                                batch.healthStatus === 'Karantina'
                                  ? 'text-red-700 font-medium'
                                  : batch.healthStatus === 'Pantauan'
                                    ? 'text-amber-700 font-medium'
                                    : batch.healthStatus === 'Siap Panen'
                                      ? 'text-[#164E38] font-medium'
                                      : 'text-emerald-700 font-medium'
                              }
                            >
                              Status: {batch.healthStatus}
                            </span>
                          </div>

                          <h4 className="text-base font-semibold text-slate-900 truncate">
                            {batch.penName}
                          </h4>

                          {batch.notes && (
                            <p className="mt-1 text-xs text-slate-600 line-clamp-2">{batch.notes}</p>
                          )}

                          <p className="mt-2 text-[11px] text-slate-400 font-mono tabular-nums">
                            Diperbarui {formatTime(batch.updatedAt)} oleh {batch.updatedBy}
                          </p>
                        </div>

                        {/* Right: Real-time population stepper & direct input */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleQuickDelta(batch, -10)}
                              aria-label={`Kurangi 10 ekor di ${batch.penName}`}
                              className="h-9 px-2.5 text-xs font-mono font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              -10
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickDelta(batch, -1)}
                              aria-label={`Kurangi 1 ekor di ${batch.penName}`}
                              className="h-9 w-9 inline-flex items-center justify-center text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors shrink-0 cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>

                            <div className="flex items-center">
                              <input
                                type="number"
                                min={0}
                                max={100000}
                                aria-label={`Jumlah ekor di ${batch.penName}`}
                                value={draftValue}
                                onFocus={() => {
                                  focusedCountIdRef.current = batch.id;
                                }}
                                onBlur={() => {
                                  if (focusedCountIdRef.current === batch.id) {
                                    focusedCountIdRef.current = null;
                                  }
                                }}
                                onChange={(e) =>
                                  setCountDrafts((prev) => ({
                                    ...prev,
                                    [batch.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleDirectCountSave(batch);
                                  }
                                }}
                                className="w-20 h-9 px-2 text-center text-sm font-mono font-semibold tabular-nums text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#164E38]/30 focus:border-[#164E38]"
                              />
                              <span className="ml-1.5 text-xs text-slate-500">ekor</span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleQuickDelta(batch, 1)}
                              aria-label={`Tambah 1 ekor di ${batch.penName}`}
                              className="h-9 w-9 inline-flex items-center justify-center text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors shrink-0 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickDelta(batch, 10)}
                              aria-label={`Tambah 10 ekor di ${batch.penName}`}
                              className="h-9 px-2.5 text-xs font-mono font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              +10
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {draftDirty && (
                              <button
                                type="button"
                                onClick={() => handleDirectCountSave(batch)}
                                className="h-9 px-3 inline-flex items-center gap-1 text-xs font-medium text-white bg-[#164E38] hover:bg-[#113D2B] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                Simpan
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => (isEditing ? setEditingId(null) : openEdit(batch))}
                              aria-label={`Ubah detail ${batch.penName}`}
                              className="h-9 px-2.5 inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                              Detail
                            </button>

                            {isConfirmDelete ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onRemoveBatch(
                                      batch.id,
                                      user?.displayName || actorName.trim() || 'Petugas Kandang'
                                    );
                                    setConfirmDeleteId(null);
                                  }}
                                  className="h-9 px-2.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  Hapus
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  aria-label="Batal hapus"
                                  className="h-9 w-9 inline-flex items-center justify-center text-slate-500 hover:text-slate-800 border border-slate-200 rounded-md cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(batch.id)}
                                aria-label={`Hapus ${batch.penName}`}
                                className="h-9 w-9 inline-flex items-center justify-center text-slate-400 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-md transition-colors shrink-0 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expandable inline detail editor */}
                      {isEditing && editDraft && (
                        <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-3">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-1">
                              Fase Pertumbuhan
                            </label>
                            <select
                              value={editDraft.phase}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, phase: e.target.value as PigPhase })
                              }
                              className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-md"
                            >
                              {PIG_PHASES.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-1">
                              Bobot Rata-Rata (kg)
                            </label>
                            <input
                              type="number"
                              step="0.1"
                              min={0}
                              max={1000}
                              value={editDraft.avgWeightKg}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, avgWeightKg: e.target.value })
                              }
                              className="w-full px-2.5 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-1">
                              Status Kesehatan
                            </label>
                            <select
                              value={editDraft.healthStatus}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  healthStatus: e.target.value as HealthStatus,
                                })
                              }
                              className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-md"
                            >
                              {HEALTH_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditSave(batch.id)}
                              className="flex-1 py-2 px-3 text-xs font-medium text-white bg-[#164E38] hover:bg-[#113D2B] rounded-md whitespace-nowrap cursor-pointer"
                            >
                              Simpan Detail
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="py-2 px-3 text-xs font-medium text-slate-600 border border-slate-300 rounded-md hover:bg-slate-100 whitespace-nowrap cursor-pointer"
                            >
                              Batal
                            </button>
                          </div>

                          <div className="sm:col-span-4">
                            <label className="block text-[11px] font-medium text-slate-600 mb-1">
                              Catatan Kandang
                            </label>
                            <input
                              type="text"
                              maxLength={200}
                              value={editDraft.notes}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, notes: e.target.value })
                              }
                              className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-md"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Real-time Activity Log */}
            <div className="border border-slate-200 rounded-xl bg-[#F8F9FA] p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#164E38]" aria-hidden="true" />
                  <h4 className="text-sm font-semibold text-slate-900">
                    Riwayat Perubahan Populasi Real-Time
                  </h4>
                </div>
                <span className="text-xs text-slate-500">Pembaruan otomatis langsung</span>
              </div>

              {events.length === 0 ? (
                <p className="text-xs text-slate-500">Belum ada aktivitas pencatatan terbaru.</p>
              ) : (
                <ul className="divide-y divide-slate-200/80 max-h-52 overflow-y-auto pr-1">
                  {events.slice(0, 10).map((evt) => {
                    const deltaSign = evt.delta > 0 ? `+${evt.delta}` : `${evt.delta}`;
                    return (
                      <li
                        key={evt.id}
                        className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs"
                      >
                        <div className="text-slate-700">
                          <span className="font-medium text-slate-900">{evt.actor}</span>{' '}
                          {evt.type === 'create' && 'menambahkan kandang baru '}
                          {evt.type === 'update' && 'memperbarui populasi '}
                          {evt.type === 'delete' && 'menghapus kandang '}
                          <span className="font-medium text-slate-900">{evt.penName}</span>
                          <span className="text-slate-400 mx-1.5" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-slate-500">
                            {evt.breed} / {evt.phase}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
                          <span
                            className={
                              evt.delta > 0
                                ? 'text-emerald-700 font-medium'
                                : evt.delta < 0
                                  ? 'text-amber-700 font-medium'
                                  : 'text-slate-500'
                            }
                          >
                            {deltaSign} ekor (total {evt.newCount})
                          </span>
                          <span className="text-slate-400">{formatTime(evt.timestamp)}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Explicit confirmation dialog before any Google Sheets mutation */}
      <ConfirmMutationModal
        pending={pendingConfirmation}
        busy={confirmBusy}
        onCancel={onCancelConfirmation}
        onProceed={onProceedConfirmation}
      />
    </section>
  );
}
