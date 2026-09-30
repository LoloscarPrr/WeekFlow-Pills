export type IntakeStatus = 'taken' | 'skipped';
export type ScheduleMode = 'fixed' | 'interval';

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
  stock: number | null;
  lowStockThreshold: number;
  active: boolean;
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
  medicationName: string;
  dose: string;
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

function normalizeTime(value: string): string {
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

export function normalizeTimes(value: string): string[] {
  const pieces = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const normalized = pieces.map(normalizeTime);
  return [...new Set(normalized)].sort();
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

export function resolveMedicationTimes(medication: Pick<Medication, 'scheduleMode' | 'times' | 'intervalHours' | 'startTime'>): string[] {
  if (medication.scheduleMode === 'interval') {
    if (medication.intervalHours === null || medication.startTime === null) {
      return [];
    }
    return generateTimesFromInterval(medication.startTime, medication.intervalHours);
  }

  return [...medication.times];
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDays(days: number[]) {
  if (days.length === 7) return 'Todos los días';
  return weekdayOptions.filter((item) => days.includes(item.value)).map((item) => item.label).join(' · ');
}
