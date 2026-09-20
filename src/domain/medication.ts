export type IntakeStatus = 'taken' | 'skipped';

export type Medication = {
  id: number;
  name: string;
  dose: string;
  instructions: string;
  times: string[];
  days: number[];
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

export function normalizeTimes(value: string): string[] {
  const pieces = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const normalized = pieces.map((piece) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(piece);
    if (!match) throw new Error(`Hora inválida: ${piece}. Usa formato HH:MM.`);
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new Error(`Hora inválida: ${piece}.`);
    }
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  });

  return [...new Set(normalized)].sort();
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
