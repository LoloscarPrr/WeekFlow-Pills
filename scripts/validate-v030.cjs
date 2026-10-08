const assert = require('node:assert/strict');
const fs = require('node:fs');

const data = fs.readFileSync('src/data/medications.ts', 'utf8');
const notifications = fs.readFileSync('src/services/notifications.ts', 'utf8');
const appConfig = JSON.parse(fs.readFileSync('app.json', 'utf8'));

// F — La misma toma no puede duplicarse ni descontar stock dos veces.
assert.match(data, /UNIQUE\(medication_id, scheduled_date, scheduled_time\)/);
assert.match(data, /if \(existing\?\.status === status\)/);

// G — Fase 4.3: recordatorios robustos, snooze preservado y sincronización serializada.
assert.match(notifications, /let syncInFlight: Promise<boolean> \| null = null/);
assert.match(notifications, /if \(syncInFlight\) return syncInFlight/);
assert.match(notifications, /kind === 'recurring'/);
assert.match(notifications, /kind === 'snooze'/);
assert.match(notifications, /seconds: 10 \* 60/);
assert.match(notifications, /duplicateSnooze/);
assert.match(notifications, /managedBy: MANAGED_BY/);

// H — Migración segura desde 0.2.0 y configuración Android esperada.
assert.match(data, /schedule_mode TEXT NOT NULL DEFAULT 'fixed'/);
assert.match(data, /ALTER TABLE medications ADD COLUMN schedule_mode TEXT NOT NULL DEFAULT 'fixed'/);
assert.match(data, /ALTER TABLE medications ADD COLUMN interval_hours INTEGER/);
assert.match(data, /ALTER TABLE medications ADD COLUMN start_time TEXT/);
assert.equal(appConfig.expo.version, '0.3.4');
assert.equal(appConfig.expo.android.versionCode, 7);
assert.equal(appConfig.expo.android.package, 'com.weekflow.pills');
assert.ok(appConfig.expo.android.permissions.includes('android.permission.SCHEDULE_EXACT_ALARM'));
assert.ok(appConfig.expo.android.permissions.includes('android.permission.RECEIVE_BOOT_COMPLETED'));

console.log('WeekFlow Pills v0.3.4 integration checks F–H + Phase 4.3 reminders: OK');
