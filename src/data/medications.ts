import * as SQLite from 'expo-sqlite';
import type { DoseOccurrence, HistoryEntry, IntakeStatus, Medication, ScheduleMode } from '@/src/domain/medication';
import { isUnresolvedDose, localDateKey, medicationRunsOnDate, resolveMedicationTimes } from '@/src/domain/medication';

const db = SQLite.openDatabaseSync('weekflow-pills.db');

let initialized = false;

export type IntakeWriteResult = 'created' | 'updated' | 'unchanged';

export type LastTaken = {
  medicationId: number;
  scheduledDate: string;
  scheduledTime: string;
  recordedAt: string;
};

function ensureIntakeSnapshotColumns() {
  const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(intakes)');
  const names = new Set(columns.map((column) => column.name));

  if (!names.has('medication_name_snapshot')) {
    db.execSync('ALTER TABLE intakes ADD COLUMN medication_name_snapshot TEXT;');
  }
  if (!names.has('dose_snapshot')) {
    db.execSync('ALTER TABLE intakes ADD COLUMN dose_snapshot TEXT;');
  }
  if (!names.has('instructions_snapshot')) {
    db.execSync("ALTER TABLE intakes ADD COLUMN instructions_snapshot TEXT NOT NULL DEFAULT '';");
  }

  db.execSync(`
    UPDATE intakes
    SET medication_name_snapshot = (
      SELECT m.name FROM medications m WHERE m.id = intakes.medication_id
    )
    WHERE medication_name_snapshot IS NULL;

    UPDATE intakes
    SET dose_snapshot = (
      SELECT m.dose FROM medications m WHERE m.id = intakes.medication_id
    )
    WHERE dose_snapshot IS NULL;
  `);
}

function ensureMedicationScheduleColumns() {
  const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(medications)');
  const names = new Set(columns.map((column) => column.name));

  if (!names.has('schedule_mode')) {
    db.execSync("ALTER TABLE medications ADD COLUMN schedule_mode TEXT NOT NULL DEFAULT 'fixed';");
  }
  if (!names.has('interval_hours')) {
    db.execSync('ALTER TABLE medications ADD COLUMN interval_hours INTEGER;');
  }
  if (!names.has('start_time')) {
    db.execSync('ALTER TABLE medications ADD COLUMN start_time TEXT;');
  }
  if (!names.has('start_date')) {
    db.execSync("ALTER TABLE medications ADD COLUMN start_date TEXT NOT NULL DEFAULT '1970-01-01';");
  }
  if (!names.has('end_date')) {
    db.execSync('ALTER TABLE medications ADD COLUMN end_date TEXT;');
  }
  if (!names.has('archived')) {
    db.execSync('ALTER TABLE medications ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;');
  }

  db.execSync(`
    UPDATE medications
    SET schedule_mode = 'fixed'
    WHERE schedule_mode IS NULL OR schedule_mode NOT IN ('fixed', 'interval');
  `);
}

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
      schedule_mode TEXT NOT NULL DEFAULT 'fixed',
      interval_hours INTEGER,
      start_time TEXT,
      start_date TEXT NOT NULL DEFAULT '1970-01-01',
      end_date TEXT,
      stock INTEGER,
      low_stock_threshold INTEGER NOT NULL DEFAULT 5,
      active INTEGER NOT NULL DEFAULT 1,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS intakes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medication_id INTEGER NOT NULL,
      scheduled_date TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('taken','skipped')),
      recorded_at TEXT NOT NULL,
      medication_name_snapshot TEXT,
      dose_snapshot TEXT,
      instructions_snapshot TEXT NOT NULL DEFAULT '',
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

  ensureMedicationScheduleColumns();
  ensureIntakeSnapshotColumns();
  initialized = true;
}

type MedicationRow = {
  id: number;
  name: string;
  dose: string;
  instructions: string;
  times_json: string;
  days_json: string;
  schedule_mode: string;
  interval_hours: number | null;
  start_time: string | null;
  start_date: string;
  end_date: string | null;
  stock: number | null;
  low_stock_threshold: number;
  active: number;
  archived: number;
  created_at: string;
};

function mapMedication(row: MedicationRow): Medication {
  const scheduleMode: ScheduleMode = row.schedule_mode === 'interval' ? 'interval' : 'fixed';
  return {
    id: row.id,
    name: row.name,
    dose: row.dose,
    instructions: row.instructions,
    times: JSON.parse(row.times_json) as string[],
    days: JSON.parse(row.days_json) as number[],
    scheduleMode,
    intervalHours: scheduleMode === 'interval' ? row.interval_hours : null,
    startTime: scheduleMode === 'interval' ? row.start_time : null,
    startDate: row.start_date,
    endDate: row.end_date,
    stock: row.stock,
    lowStockThreshold: row.low_stock_threshold,
    active: row.active === 1,
    archived: row.archived === 1,
    createdAt: row.created_at,
  };
}

const medicationSelect = `
  SELECT id, name, dose, instructions, times_json, days_json,
         schedule_mode, interval_hours, start_time, start_date, end_date,
         stock, low_stock_threshold, active, archived, created_at
  FROM medications
`;

export function listMedications(includeInactive = true): Medication[] {
  ensureDatabase();
  const rows = db.getAllSync<MedicationRow>(
    `${medicationSelect}
     WHERE archived = 0
       ${includeInactive ? '' : 'AND active = 1'}
     ORDER BY active DESC, name COLLATE NOCASE ASC`,
  );
  return rows.map(mapMedication);
}

export function listArchivedMedications(): Medication[] {
  ensureDatabase();
  return db.getAllSync<MedicationRow>(
    `${medicationSelect}
     WHERE archived = 1
     ORDER BY name COLLATE NOCASE ASC`,
  ).map(mapMedication);
}

export function getMedicationById(id: number): Medication | null {
  ensureDatabase();
  const row = db.getFirstSync<MedicationRow>(
    `${medicationSelect}
     WHERE id = ?`,
    id,
  );
  return row ? mapMedication(row) : null;
}

export function addMedication(input: Omit<Medication, 'id' | 'active' | 'archived'>) {
  ensureDatabase();
  db.runSync(
    `INSERT INTO medications
      (name, dose, instructions, times_json, days_json, schedule_mode, interval_hours, start_time,
       start_date, end_date, stock, low_stock_threshold, active, archived, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)`,
    input.name.trim(),
    input.dose.trim(),
    input.instructions.trim(),
    JSON.stringify(input.times),
    JSON.stringify(input.days),
    input.scheduleMode,
    input.intervalHours,
    input.startTime,
    input.startDate,
    input.endDate,
    input.stock,
    input.lowStockThreshold,
    new Date().toISOString(),
  );
}

export function updateMedication(input: Medication) {
  ensureDatabase();
  db.runSync(
    `UPDATE medications
     SET name = ?, dose = ?, instructions = ?, times_json = ?, days_json = ?,
         schedule_mode = ?, interval_hours = ?, start_time = ?,
         start_date = ?, end_date = ?, stock = ?, low_stock_threshold = ?, active = ?, archived = ?
     WHERE id = ?`,
    input.name.trim(),
    input.dose.trim(),
    input.instructions.trim(),
    JSON.stringify(input.times),
    JSON.stringify(input.days),
    input.scheduleMode,
    input.intervalHours,
    input.startTime,
    input.startDate,
    input.endDate,
    input.stock,
    input.lowStockThreshold,
    input.active ? 1 : 0,
    input.archived ? 1 : 0,
    input.id,
  );
}

export function setMedicationActive(id: number, active: boolean) {
  ensureDatabase();
  db.runSync(
    'UPDATE medications SET active = ? WHERE id = ? AND archived = 0',
    active ? 1 : 0,
    id,
  );
}

export function setMedicationArchived(id: number, archived: boolean) {
  ensureDatabase();
  db.runSync(
    'UPDATE medications SET archived = ?, active = ? WHERE id = ?',
    archived ? 1 : 0,
    archived ? 0 : 1,
    id,
  );
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

function createdOnOrBefore(medication: Medication, dateKey: string) {
  if (!medication.createdAt) return true;
  return localDateKey(new Date(medication.createdAt)) <= dateKey;
}

export function listDosesForDate(date: Date): DoseOccurrence[] {
  ensureDatabase();
  const dateKey = localDateKey(date);
  const meds = listMedications(false).filter(
    (medication) => medicationRunsOnDate(medication, date) && createdOnOrBefore(medication, dateKey),
  );
  const rows = db.getAllSync<IntakeRow>(
    'SELECT medication_id, scheduled_time, status, recorded_at FROM intakes WHERE scheduled_date = ?',
    dateKey,
  );
  const byKey = new Map(rows.map((row) => [`${row.medication_id}:${row.scheduled_time}`, row]));

  return meds
    .flatMap((medication) =>
      resolveMedicationTimes(medication).map((scheduledTime) => {
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

export function listTodayDoses(date = new Date()): DoseOccurrence[] {
  return listDosesForDate(date);
}

export function listOutstandingDoses(now = new Date(), lookbackDays = 7): DoseOccurrence[] {
  ensureDatabase();
  if (!Number.isInteger(lookbackDays) || lookbackDays < 0 || lookbackDays > 31) {
    throw new Error('lookbackDays debe ser un entero entre 0 y 31.');
  }

  const result: DoseOccurrence[] = [];
  for (let offset = lookbackDays; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    result.push(...listDosesForDate(date).filter((occurrence) => isUnresolvedDose(occurrence, now)));
  }

  return result.sort((a, b) => {
    const left = `${a.scheduledDate}T${a.scheduledTime}`;
    const right = `${b.scheduledDate}T${b.scheduledTime}`;
    return left.localeCompare(right);
  });
}

export function createOccurrence(medicationId: number, scheduledDate: string, scheduledTime: string): DoseOccurrence | null {
  ensureDatabase();
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
    `INSERT INTO intakes (
       medication_id, scheduled_date, scheduled_time, status, recorded_at,
       medication_name_snapshot, dose_snapshot, instructions_snapshot
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(medication_id, scheduled_date, scheduled_time)
     DO UPDATE SET
       status = excluded.status,
       recorded_at = excluded.recorded_at,
       medication_name_snapshot = COALESCE(intakes.medication_name_snapshot, excluded.medication_name_snapshot),
       dose_snapshot = COALESCE(intakes.dose_snapshot, excluded.dose_snapshot),
       instructions_snapshot = CASE
         WHEN intakes.instructions_snapshot = '' THEN excluded.instructions_snapshot
         ELSE intakes.instructions_snapshot
       END`,
    occurrence.medication.id,
    occurrence.scheduledDate,
    occurrence.scheduledTime,
    status,
    now,
    occurrence.medication.name,
    occurrence.medication.dose,
    occurrence.medication.instructions,
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
  medication_id: number;
  medication_name: string;
  dose: string;
  instructions: string;
  scheduled_date: string;
  scheduled_time: string;
  status: IntakeStatus;
  recorded_at: string;
};

export function listHistory(limit = 100): HistoryEntry[] {
  ensureDatabase();
  return db.getAllSync<HistoryRow>(
    `SELECT
       i.id,
       i.medication_id,
       COALESCE(i.medication_name_snapshot, m.name) AS medication_name,
       COALESCE(i.dose_snapshot, m.dose) AS dose,
       COALESCE(i.instructions_snapshot, m.instructions, '') AS instructions,
       i.scheduled_date,
       i.scheduled_time,
       i.status,
       i.recorded_at
     FROM intakes i
     JOIN medications m ON m.id = i.medication_id
     ORDER BY i.scheduled_date DESC, i.scheduled_time DESC, i.recorded_at DESC
     LIMIT ?`,
    limit,
  ).map((row) => ({
    id: row.id,
    medicationId: row.medication_id,
    medicationName: row.medication_name,
    dose: row.dose,
    instructions: row.instructions,
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time,
    status: row.status,
    recordedAt: row.recorded_at,
  }));
}


export function correctHistoryEntry(entry: HistoryEntry, status: IntakeStatus): IntakeWriteResult {
  ensureDatabase();
  const medication = getMedicationById(entry.medicationId);
  if (!medication) throw new Error('No se encontró el medicamento asociado a este registro.');

  return recordIntake({
    medication,
    scheduledDate: entry.scheduledDate,
    scheduledTime: entry.scheduledTime,
    status: entry.status,
    recordedAt: entry.recordedAt,
  }, status);
}
