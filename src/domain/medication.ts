export type IntakeStatus = 'taken' | 'skipped';
export type ScheduleMode = 'fixed' | 'interval';
export type DoseTimingState = 'upcoming' | 'pending' | 'overdue' | 'taken' | 'skipped';

export type Medication = {
  id: number;
  name: string;
  dose: string;
  instructions: string;
  times: string[];
  days: number[];
  scheduleMode: ScheduleMode;
  intervalHours: number | null;
  startTime: string | null;
  startDate: string;
  endDate: string | null;
  stock: number | null;
  lowStockThreshold: number;
  active: boolean;
  archived: boolean;
  createdAt?: string;
};

export type DoseOccurrence = {
  medication: Medication;
  scheduledDate: string;
  scheduledTime: string;
  status: IntakeStatus | null;
  recordedAt: string | null;
};

export type HistoryEntry = {
  id: number;
  medicationId: number;
  medicationName: string;
  dose: string;
  instructions: string;
  scheduledDate: string;
  scheduledTime: string;
  status: IntakeStatus;
  recordedAt: string;
};

export const weekdayOptions = [
  { value: 1, label: 'L' },
  { value: 2, label: 'M' },
  { value: 3, label: 'X' },
  { value: 4, label: 'J' },
  { value: 5, label: 'V' },
  { value: 6, label: 'S' },
  { value: 0, label: 'D' },
] as const;

export function normalizeTime(value: string): string {
  const piece = value.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(piece);
  if (!match) throw new Error(`Hora inválida: ${piece || value}. Usa formato HH:MM.`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Hora inválida: ${piece}.`);
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function normalizeTimes(value: string | string[]): string[] {
  const pieces = Array.isArray(value)
    ? value
    : value.split(',').map((part) => part.trim()).filter(Boolean);
  const normalized = pieces.map(normalizeTime);
  return [...new Set(normalized)].sort();
}

export function normalizeDateKey(value: string): string {
  const piece = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(piece);
  if (!match) throw new Error('Usa la fecha en formato AAAA-MM-DD.');
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    throw new Error(`Fecha inválida: ${piece}.`);
  }
  return piece;
}

export function generateTimesFromInterval(startTime: string, intervalHours: number): string[] {
  if (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 24) {
    throw new Error('El intervalo debe ser un número entero entre 1 y 24 horas.');
  }

  const normalizedStart = normalizeTime(startTime);
  const [hour, minute] = normalizedStart.split(':').map(Number);
  const startMinutes = hour * 60 + minute;
  const intervalMinutes = intervalHours * 60;
  const result: string[] = [];

  for (let elapsed = 0; elapsed < 24 * 60; elapsed += intervalMinutes) {
    const value = (startMinutes + elapsed) % (24 * 60);
    const nextHour = Math.floor(value / 60);
    const nextMinute = value % 60;
    result.push(`${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`);
  }

  return result;
}

export function resolveMedicationTimes(
  medication: Pick<Medication, 'scheduleMode' | 'times' | 'intervalHours' | 'startTime'>,
): string[] {
  if (medication.scheduleMode === 'interval') {
    if (medication.intervalHours === null || medication.startTime === null) return [];
    return generateTimesFromInterval(medication.startTime, medication.intervalHours);
  }
  return normalizeTimes(medication.times);
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function medicationRunsOnDate(
  medication: Pick<Medication, 'startDate' | 'endDate' | 'days'>,
  date: Date,
): boolean {
  const dateKey = localDateKey(date);
  if (dateKey < medication.startDate) return false;
  if (medication.endDate && dateKey > medication.endDate) return false;
  return medication.days.includes(date.getDay());
}

export function validateMedicationDateRange(startDate: string, endDate: string | null) {
  const normalizedStart = normalizeDateKey(startDate);
  const normalizedEnd = endDate ? normalizeDateKey(endDate) : null;
  if (normalizedEnd && normalizedEnd < normalizedStart) {
    throw new Error('La fecha de término no puede ser anterior a la fecha de inicio.');
  }
  return { startDate: normalizedStart, endDate: normalizedEnd };
}

export function scheduledDateTime(scheduledDate: string, scheduledTime: string): Date {
  const dateKey = normalizeDateKey(scheduledDate);
  const [year, month, day] = dateKey.split('-').map(Number);
  const normalizedTime = normalizeTime(scheduledTime);
  const [hour, minute] = normalizedTime.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

export function doseTimingState(
  occurrence: Pick<DoseOccurrence, 'scheduledDate' | 'scheduledTime' | 'status'>,
  now = new Date(),
): DoseTimingState {
  if (occurrence.status === 'taken') return 'taken';
  if (occurrence.status === 'skipped') return 'skipped';

  const scheduled = scheduledDateTime(occurrence.scheduledDate, occurrence.scheduledTime);
  const nowMinute = new Date(
    now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), 0, 0,
  );

  if (scheduled.getTime() > nowMinute.getTime()) return 'upcoming';
  if (scheduled.getTime() === nowMinute.getTime()) return 'pending';
  return 'overdue';
}

export function isUnresolvedDose(
  occurrence: Pick<DoseOccurrence, 'scheduledDate' | 'scheduledTime' | 'status'>,
  now = new Date(),
): boolean {
  if (occurrence.status !== null) return false;
  return scheduledDateTime(occurrence.scheduledDate, occurrence.scheduledTime).getTime() <= now.getTime();
}

export function upcomingMedicationOccurrences(
  medication: Pick<Medication, 'scheduleMode' | 'times' | 'intervalHours' | 'startTime' | 'startDate' | 'endDate' | 'days'>,
  from = new Date(),
  limit = 6,
): Array<{ date: string; time: string }> {
  const result: Array<{ date: string; time: string }> = [];
  const times = resolveMedicationTimes(medication);
  if (!times.length || limit < 1) return result;

  for (let offset = 0; offset < 60 && result.length < limit; offset += 1) {
    const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset);
    if (!medicationRunsOnDate(medication, date)) continue;
    const dateKey = localDateKey(date);
    for (const time of times) {
      const when = scheduledDateTime(dateKey, time);
      if (when.getTime() < from.getTime()) continue;
      result.push({ date: dateKey, time });
      if (result.length >= limit) break;
    }
  }

  return result;
}

export function formatDays(days: number[]) {
  if (days.length === 7) return 'Todos los días';
  return weekdayOptions.filter((item) => days.includes(item.value)).map((item) => item.label).join(' · ');
}
