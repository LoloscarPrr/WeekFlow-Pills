const assert = require('node:assert/strict');
const { generateTimesFromInterval, normalizeTimes, resolveMedicationTimes } = require('../.tmp-tests/medication.js');

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

assert.throws(() => generateTimesFromInterval('09:00', 0));
assert.throws(() => generateTimesFromInterval('09:00', 25));
assert.throws(() => generateTimesFromInterval('25:00', 6));

console.log('WeekFlow Pills v0.3.0 scheduling tests A–E: OK');
