import * as SQLite from 'expo-sqlite';
import type { DoseOccurrence, HistoryEntry, IntakeStatus, Medication } from '@/src/domain/medication';
import { localDateKey } from '@/src/domain/medication';

const db = SQLite.openDatabaseSync('weekflow-pills.db');

let initialized = false;

export type IntakeWriteResult = 'created' | 'updated' | 'unchanged';

export type LastTaken = {
  medicationId: number;
  scheduledDate: string;
  scheduledTime: string;
  recordedAt: string;
};

export function ensureDatabase() {
  if (initialized) return;
  db.execSync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS medications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      dose TEXT NOT NULL,
      instructions TEXT NOT NULL DEFAULT '',
      times_json TEXT NOT NULL,
      days_json TEXT NOT NULL,
      stock INTEGER,
      low_stock_threshold INTEGER NOT NULL DEFAULT 5,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS intakes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medication_id INTEGER NOT NULL,
      scheduled_date TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('taken','skipped')),
      recorded_at TEXT NOT NULL,
      UNIQUE(medication_id, scheduled_date, scheduled_time),
      FOREIGN KEY(medication_id) REFERENCES medications(id)
    );

    CREATE TABLE IF NOT EXISTS intake_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medication_id INTEGER NOT NULL,
      scheduled_date TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      changed_at TEXT NOT NULL,
      FOREIGN KEY(medication_id) REFERENCES medications(id)
    );

    CREATE TABLE IF NOT EXISTS handled_notification_actions (
      action_key TEXT PRIMARY KEY,
      handled_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_intakes_date ON intakes(scheduled_date);
    CREATE INDEX IF NOT EXISTS idx_intakes_medication_status ON intakes(medication_id, status, recorded_at);
  `);
  initialized = true;
}

type MedicationRow = {
  id: number;
  name: string;
  dose: string;
  instructions: string;
  times_json: string;
  days_json: string;
  stock: number | null;
  low_stock_threshold: number;
  active: number;
};

function mapMedication(row: MedicationRow): Medication {
  return {
    id: row.id,
    name: row.name,
    dose: row.dose,
    instructions: row.instructions,
    times: JSON.parse(row.times_json) as string[],
    days: JSON.parse(row.days_json) as number[],
    stock: row.stock,
    lowStockThreshold: row.low_stock_threshold,
    active: row.active === 1,
  };
}

export function listMedications(includeInactive = true): Medication[] {
  ensureDatabase();
  const rows = db.getAllSync<MedicationRow>(
    `SELECT id, name, dose, instructions, times_json, days_json, stock, low_stock_threshold, active
     FROM medications
     ${includeInactive ? '' : 'WHERE active = 1'}
     ORDER BY active DESC, name COLLATE NOCASE ASC`
  );
  return rows.map(mapMedication);
}

export function getMedicationById(id: number): Medication | null {
  ensureDatabase();
  const row = db.getFirstSync<MedicationRow>(
    `SELECT id, name, dose, instructions, times_json, days_json, stock, low_stock_threshold, active
     FROM medications
     WHERE id = ?`,
    id,
  );
  return row ? mapMedication(row) : null;
}

export function addMedication(input: Omit<Medication, 'id' | 'active'>) {
  ensureDatabase();
  db.runSync(
    `INSERT INTO medications
      (name, dose, instructions, times_json, days_json, stock, low_stock_threshold, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    input.name.trim(),
    input.dose.trim(),
    input.instructions.trim(),
    JSON.stringify(input.times),
    JSON.stringify(input.days),
    input.stock,
    input.lowStockThreshold,
    new Date().toISOString(),
  );
}

export function updateMedication(input: Medication) {
  ensureDatabase();
  db.runSync(
    `UPDATE medications
     SET name = ?, dose = ?, instructions = ?, times_json = ?, days_json = ?, stock = ?, low_stock_threshold = ?, active = ?
     WHERE id = ?`,
    input.name.trim(),
    input.dose.trim(),
    input.instructions.trim(),
    JSON.stringify(input.times),
    JSON.stringify(input.days),
    input.stock,
    input.lowStockThreshold,
    input.active ? 1 : 0,
    input.id,
  );
}

export function setMedicationActive(id: number, active: boolean) {
  ensureDatabase();
  db.runSync('UPDATE medications SET active = ? WHERE id = ?', active ? 1 : 0, id);
}

export function setMedicationStock(id: number, stock: number | null) {
  ensureDatabase();
  db.runSync('UPDATE medications SET stock = ? WHERE id = ?', stock, id);
}

type IntakeRow = {
  medication_id: number;
  scheduled_time: string;
  status: IntakeStatus;
  recorded_at: string;
};

export function listTodayDoses(date = new Date()): DoseOccurrence[] {
  ensureDatabase();
  const dateKey = localDateKey(date);
  const weekday = date.getDay();
  const meds = listMedications(false).filter((medication) => medication.days.includes(weekday));
  const rows = db.getAllSync<IntakeRow>(
    'SELECT medication_id, scheduled_time, status, recorded_at FROM intakes WHERE scheduled_date = ?',
    dateKey,
  );
  const byKey = new Map(rows.map((row) => [`${row.medication_id}:${row.scheduled_time}`, row]));

  return meds
    .flatMap((medication) =>
      medication.times.map((scheduledTime) => {
        const intake = byKey.get(`${medication.id}:${scheduledTime}`);
        return {
          medication,
          scheduledDate: dateKey,
          scheduledTime,
          status: intake?.status ?? null,
          recordedAt: intake?.recorded_at ?? null,
        } satisfies DoseOccurrence;
      }),
    )
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
}

export function createOccurrence(medicationId: number, scheduledDate: string, scheduledTime: string): DoseOccurrence | null {
  const medication = getMedicationById(medicationId);
  if (!medication) return null;

  const row = db.getFirstSync<{ status: IntakeStatus; recorded_at: string }>(
    `SELECT status, recorded_at
     FROM intakes
     WHERE medication_id = ? AND scheduled_date = ? AND scheduled_time = ?`,
    medicationId,
    scheduledDate,
    scheduledTime,
  );

  return {
    medication,
    scheduledDate,
    scheduledTime,
    status: row?.status ?? null,
    recordedAt: row?.recorded_at ?? null,
  };
}

export function recordIntake(occurrence: DoseOccurrence, status: IntakeStatus): IntakeWriteResult {
  ensureDatabase();
  const existing = db.getFirstSync<{ status: IntakeStatus; recorded_at: string }>(
    `SELECT status, recorded_at FROM intakes
     WHERE medication_id = ? AND scheduled_date = ? AND scheduled_time = ?`,
    occurrence.medication.id,
    occurrence.scheduledDate,
    occurrence.scheduledTime,
  );

  if (existing?.status === status) {
    return 'unchanged';
  }

  if (occurrence.medication.stock !== null) {
    if (status === 'taken' && existing?.status !== 'taken') {
      db.runSync(
        'UPDATE medications SET stock = MAX(stock - 1, 0) WHERE id = ? AND stock IS NOT NULL',
        occurrence.medication.id,
      );
    } else if (status !== 'taken' && existing?.status === 'taken') {
      db.runSync(
        'UPDATE medications SET stock = stock + 1 WHERE id = ? AND stock IS NOT NULL',
        occurrence.medication.id,
      );
    }
  }

  const now = new Date().toISOString();

  db.runSync(
    `INSERT INTO intake_audit
      (medication_id, scheduled_date, scheduled_time, previous_status, new_status, changed_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    occurrence.medication.id,
    occurrence.scheduledDate,
    occurrence.scheduledTime,
    existing?.status ?? null,
    status,
    now,
  );

  db.runSync(
    `INSERT INTO intakes (medication_id, scheduled_date, scheduled_time, status, recorded_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(medication_id, scheduled_date, scheduled_time)
     DO UPDATE SET status = excluded.status, recorded_at = excluded.recorded_at`,
    occurrence.medication.id,
    occurrence.scheduledDate,
    occurrence.scheduledTime,
    status,
    now,
  );

  return existing ? 'updated' : 'created';
}

type LastTakenRow = {
  medication_id: number;
  scheduled_date: string;
  scheduled_time: string;
  recorded_at: string;
};

export function listLastTakenByMedication(): Record<number, LastTaken> {
  ensureDatabase();
  const rows = db.getAllSync<LastTakenRow>(
    `SELECT i.medication_id, i.scheduled_date, i.scheduled_time, i.recorded_at
     FROM intakes i
     INNER JOIN (
       SELECT medication_id, MAX(recorded_at) AS latest_recorded_at
       FROM intakes
       WHERE status = 'taken'
       GROUP BY medication_id
     ) latest
       ON latest.medication_id = i.medication_id
      AND latest.latest_recorded_at = i.recorded_at
     WHERE i.status = 'taken'`,
  );

  return Object.fromEntries(rows.map((row) => [
    row.medication_id,
    {
      medicationId: row.medication_id,
      scheduledDate: row.scheduled_date,
      scheduledTime: row.scheduled_time,
      recordedAt: row.recorded_at,
    },
  ]));
}

export function markNotificationActionHandled(actionKey: string): boolean {
  ensureDatabase();
  const result = db.runSync(
    'INSERT OR IGNORE INTO handled_notification_actions (action_key, handled_at) VALUES (?, ?)',
    actionKey,
    new Date().toISOString(),
  );
  return result.changes > 0;
}

type HistoryRow = {
  id: number;
  medication_name: string;
  dose: string;
  scheduled_date: string;
  scheduled_time: string;
  status: IntakeStatus;
  recorded_at: string;
};

export function listHistory(limit = 100): HistoryEntry[] {
  ensureDatabase();
  return db.getAllSync<HistoryRow>(
    `SELECT i.id, m.name AS medication_name, m.dose, i.scheduled_date, i.scheduled_time, i.status, i.recorded_at
     FROM intakes i
     JOIN medications m ON m.id = i.medication_id
     ORDER BY i.recorded_at DESC
     LIMIT ?`,
    limit,
  ).map((row) => ({
    id: row.id,
    medicationName: row.medication_name,
    dose: row.dose,
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time,
    status: row.status,
    recordedAt: row.recorded_at,
  }));
}
