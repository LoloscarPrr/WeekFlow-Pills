const assert = require('node:assert/strict');
const {
  doseTimingState,
  generateTimesFromInterval,
  isUnresolvedDose,
  normalizeTimes,
  resolveMedicationTimes,
  scheduledDateTime,
} = require('../.tmp-tests/medication.js');

function medication(overrides = {}) {
  return {
    id: 1,
    name: 'Test',
    dose: '1 comprimido',
    instructions: '',
    times: ['09:00'],
    days: [0, 1, 2, 3, 4, 5, 6],
    scheduleMode: 'fixed',
    intervalHours: null,
    startTime: null,
    stock: null,
    lowStockThreshold: 5,
    active: true,
    ...overrides,
  };
}

function occurrence(overrides = {}) {
  return {
    medication: medication(),
    scheduledDate: '2026-10-08',
    scheduledTime: '09:00',
    status: null,
    recordedAt: null,
    ...overrides,
  };
}

// A — Horas específicas.
assert.deepEqual(normalizeTimes('21:00, 09:00'), ['09:00', '21:00']);
assert.deepEqual(resolveMedicationTimes(medication({ times: ['09:00', '21:00'] })), ['09:00', '21:00']);

// B — Cada 6 horas desde 09:00, con rollover.
assert.deepEqual(generateTimesFromInterval('09:00', 6), ['09:00', '15:00', '21:00', '03:00']);

// C — Cada 8 horas desde 07:00.
assert.deepEqual(generateTimesFromInterval('07:00', 8), ['07:00', '15:00', '23:00']);

// D — Edición: el texto de dosis nunca define el horario.
assert.deepEqual(
  resolveMedicationTimes(medication({ scheduleMode: 'interval', times: [], intervalHours: 6, startTime: '09:00', dose: '2 comprimidos cada 4 horas' })),
  ['09:00', '15:00', '21:00', '03:00'],
);

// E — Cambiar de modo vuelve a la fuente de verdad del modo seleccionado.
assert.deepEqual(
  resolveMedicationTimes(medication({ scheduleMode: 'fixed', times: ['08:30', '20:30'], intervalHours: 6, startTime: '09:00' })),
  ['08:30', '20:30'],
);

// Fase 4.1 — estados temporales explícitos.
const now = new Date(2026, 9, 8, 9, 0, 30);
assert.equal(doseTimingState(occurrence({ scheduledTime: '10:00' }), now), 'upcoming');
assert.equal(doseTimingState(occurrence({ scheduledTime: '09:00' }), now), 'pending');
assert.equal(doseTimingState(occurrence({ scheduledTime: '08:59' }), now), 'overdue');
assert.equal(doseTimingState(occurrence({ status: 'taken' }), now), 'taken');
assert.equal(doseTimingState(occurrence({ status: 'skipped' }), now), 'skipped');

// Una toma no resuelta conserva su fecha original al cruzar medianoche.
const afterMidnight = new Date(2026, 9, 9, 0, 20, 0);
const previousDay = occurrence({ scheduledDate: '2026-10-08', scheduledTime: '23:00' });
assert.equal(doseTimingState(previousDay, afterMidnight), 'overdue');
assert.equal(isUnresolvedDose(previousDay, afterMidnight), true);
assert.equal(isUnresolvedDose({ ...previousDay, status: 'skipped' }, afterMidnight), false);
assert.equal(scheduledDateTime('2026-10-08', '23:00').getDate(), 8);

assert.throws(() => generateTimesFromInterval('09:00', 0));
assert.throws(() => generateTimesFromInterval('09:00', 25));
assert.throws(() => generateTimesFromInterval('25:00', 6));
assert.throws(() => scheduledDateTime('2026-02-31', '09:00'));

console.log('WeekFlow Pills scheduling + Phase 4.1 timing tests: OK');
