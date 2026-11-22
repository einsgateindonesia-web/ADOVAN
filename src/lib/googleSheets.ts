import {
  HEALTH_STATUSES,
  PIG_BREEDS,
  PIG_PHASES,
  type HealthStatus,
  type PigBatch,
  type PigBreed,
  type PigPhase,
  type PopulationEvent,
} from '../types/population';

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export const POPULATION_HEADERS = [
  'ID_Kandang',
  'Nama_Kandang',
  'Ras_Babi',
  'Fase_Pertumbuhan',
  'Jumlah_Ekor',
  'Bobot_Rata_Kg',
  'Status_Kesehatan',
  'Catatan',
  'Terakhir_Diperbarui',
  'Diperbarui_Oleh',
];

export interface SpreadsheetInfo {
  spreadsheetId: string;
  title: string;
  sheetNames: string[];
  activeSheetName: string;
}

export function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch?.[1]) return urlMatch[1];
  if (/^[a-zA-Z0-9-_]{15,}$/.test(trimmed)) return trimmed;
  return null;
}

function escapeSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

async function sheetsFetch<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = `Google Sheets error (${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) {
        message = errJson.error.message;
      }
    } catch {
      // keep fallback message
    }
    if (res.status === 401) {
      throw new Error('Sesi akses Google Sheets berakhir. Silakan masuk ulang dengan Google.');
    }
    if (res.status === 403) {
      throw new Error('Akun Google Anda tidak memiliki izin edit pada spreadsheet ini.');
    }
    if (res.status === 404) {
      throw new Error('Spreadsheet tidak ditemukan. Periksa kembali ID atau link Google Sheets.');
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

export async function getSpreadsheetMetadata(
  spreadsheetId: string,
  accessToken: string,
  preferredSheet?: string
): Promise<SpreadsheetInfo> {
  const data = await sheetsFetch<{
    spreadsheetId: string;
    properties?: { title?: string };
    sheets?: Array<{ properties?: { title?: string } }>;
  }>(
    `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,properties.title,sheets.properties.title`,
    accessToken
  );

  const sheetNames = (data.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => Boolean(t));

  if (sheetNames.length === 0) {
    throw new Error('Spreadsheet tidak memiliki tab lembar kerja.');
  }

  const activeSheetName =
    preferredSheet && sheetNames.includes(preferredSheet) ? preferredSheet : sheetNames[0];

  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || 'Spreadsheet Populasi Babi',
    sheetNames,
    activeSheetName,
  };
}

export async function createPopulationSpreadsheet(
  accessToken: string,
  initialBatches: PigBatch[]
): Promise<SpreadsheetInfo> {
  const created = await sheetsFetch<{
    spreadsheetId: string;
    properties?: { title?: string };
    sheets?: Array<{ properties?: { title?: string } }>;
  }>(SHEETS_BASE, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        title: `Bhumi Swana — Populasi Ternak Babi (${new Date().toLocaleDateString('id-ID')})`,
      },
      sheets: [
        { properties: { title: 'Populasi_Kandang' } },
        { properties: { title: 'Riwayat_Update' } },
      ],
    }),
  });

  const info: SpreadsheetInfo = {
    spreadsheetId: created.spreadsheetId,
    title: created.properties?.title || 'Bhumi Swana — Populasi Ternak Babi',
    sheetNames: ['Populasi_Kandang', 'Riwayat_Update'],
    activeSheetName: 'Populasi_Kandang',
  };

  await writeAllBatchesToSheet(info.spreadsheetId, info.activeSheetName, accessToken, initialBatches);
  return info;
}

function normalizeBreed(val: unknown): PigBreed {
  const str = String(val ?? '').trim();
  return PIG_BREEDS.includes(str as PigBreed) ? (str as PigBreed) : 'Persilangan F1';
}

function normalizePhase(val: unknown): PigPhase {
  const str = String(val ?? '').trim();
  return PIG_PHASES.includes(str as PigPhase) ? (str as PigPhase) : 'Pembesaran';
}

function normalizeHealth(val: unknown): HealthStatus {
  const str = String(val ?? '').trim();
  return HEALTH_STATUSES.includes(str as HealthStatus) ? (str as HealthStatus) : 'Sehat';
}

export async function readBatchesFromSheet(
  spreadsheetId: string,
  sheetName: string,
  accessToken: string
): Promise<{ batches: PigBatch[]; hasHeaders: boolean }> {
  const range = `${escapeSheetTitle(sheetName)}!A1:J500`;
  const data = await sheetsFetch<{ values?: string[][] }>(
    `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
    accessToken
  );

  const rows = data.values ?? [];
  if (rows.length === 0) {
    return { batches: [], hasHeaders: false };
  }

  const firstRow = rows[0].map((c) => String(c ?? '').trim());
  const hasHeaders =
    firstRow[0] === 'ID_Kandang' ||
    firstRow[1] === 'Nama_Kandang' ||
    firstRow.some((h) => h.toLowerCase().includes('kandang'));

  const dataRows = hasHeaders ? rows.slice(1) : rows;
  const batches: PigBatch[] = [];

  dataRows.forEach((row, index) => {
    const penName = String(row[1] ?? '').trim();
    if (!penName) return;

    const id = String(row[0] ?? '').trim() || `sheet-row-${index + 2}`;
    const rawCount = Number(String(row[4] ?? '0').replace(/[^\d.-]/g, ''));
    const rawWeight = Number(String(row[5] ?? '0').replace(',', '.'));

    batches.push({
      id,
      penName,
      breed: normalizeBreed(row[2]),
      phase: normalizePhase(row[3]),
      count: Number.isFinite(rawCount) ? Math.max(0, Math.round(rawCount)) : 0,
      avgWeightKg: Number.isFinite(rawWeight) ? Math.max(0, Math.round(rawWeight * 10) / 10) : 0,
      healthStatus: normalizeHealth(row[6]),
      notes: String(row[7] ?? '').trim(),
      updatedAt: String(row[8] ?? '').trim() || new Date().toISOString(),
      updatedBy: String(row[9] ?? '').trim() || 'Google Sheets',
    });
  });

  return { batches, hasHeaders };
}

export function batchToRow(batch: PigBatch): (string | number)[] {
  return [
    batch.id,
    batch.penName,
    batch.breed,
    batch.phase,
    batch.count,
    batch.avgWeightKg,
    batch.healthStatus,
    batch.notes,
    batch.updatedAt,
    batch.updatedBy,
  ];
}

export async function writeAllBatchesToSheet(
  spreadsheetId: string,
  sheetName: string,
  accessToken: string,
  batches: PigBatch[]
): Promise<void> {
  const clearRange = `${escapeSheetTitle(sheetName)}!A1:J500`;
  await sheetsFetch(
    `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(clearRange)}:clear`,
    accessToken,
    { method: 'POST', body: JSON.stringify({}) }
  );

  const values = [POPULATION_HEADERS, ...batches.map(batchToRow)];
  const writeRange = `${escapeSheetTitle(sheetName)}!A1`;
  await sheetsFetch(
    `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(writeRange)}?valueInputOption=USER_ENTERED`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify({ values }),
    }
  );
}

export async function appendSheetAuditEvent(
  spreadsheetId: string,
  sheetNames: string[],
  accessToken: string,
  event: PopulationEvent
): Promise<void> {
  if (!sheetNames.includes('Riwayat_Update')) return;
  const range = `${escapeSheetTitle('Riwayat_Update')}!A:H`;
  await sheetsFetch(
    `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        values: [
          [
            event.timestamp,
            event.actor,
            event.type,
            event.penName,
            event.breed,
            event.phase,
            event.delta,
            event.newCount,
          ],
        ],
      }),
    }
  );
}
