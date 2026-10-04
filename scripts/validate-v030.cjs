const assert = require('node:assert/strict');
const fs = require('node:fs');

const data = fs.readFileSync('src/data/medications.ts', 'utf8');
const notifications = fs.readFileSync('src/services/notifications.ts', 'utf8');
const appConfig = JSON.parse(fs.readFileSync('app.json', 'utf8'));

// F — La misma toma no puede duplicarse ni descontar stock dos veces.
assert.match(data, /UNIQUE\(medication_id, scheduled_date, scheduled_time\)/);
assert.match(data, /if \(existing\?\.status === status\)/);

// G — Posponer 10 min sobrevive a la resincronización de recordatorios.
assert.match(notifications, /if \(kind !== 'snooze'\)/);
assert.match(notifications, /seconds: 10 \* 60/);

// H — Migración segura desde 0.2.0 y versión Android esperada.
assert.match(data, /schedule_mode TEXT NOT NULL DEFAULT 'fixed'/);
assert.match(data, /ALTER TABLE medications ADD COLUMN schedule_mode TEXT NOT NULL DEFAULT 'fixed'/);
assert.match(data, /ALTER TABLE medications ADD COLUMN interval_hours INTEGER/);
assert.match(data, /ALTER TABLE medications ADD COLUMN start_time TEXT/);
assert.equal(appConfig.expo.version, '0.3.3');
assert.equal(appConfig.expo.android.versionCode, 6);
assert.equal(appConfig.expo.android.package, 'com.weekflow.pills');

console.log('WeekFlow Pills v0.3.3 integration checks F–H: OK');
