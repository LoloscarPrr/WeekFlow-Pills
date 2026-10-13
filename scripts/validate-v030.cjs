const assert = require('node:assert/strict');
const fs = require('node:fs');

const data = fs.readFileSync('src/data/medications.ts', 'utf8');
const notifications = fs.readFileSync('src/services/notifications.ts', 'utf8');
const appConfig = JSON.parse(fs.readFileSync('app.json', 'utf8'));
const backup = fs.readFileSync('src/services/backup.ts', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const today = fs.readFileSync('app/index.tsx', 'utf8');
const history = fs.readFileSync('app/history.tsx', 'utf8');
const medications = fs.readFileSync('app/medications.tsx', 'utf8');
const bottomNav = fs.readFileSync('src/components/BottomNav.tsx', 'utf8');

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
assert.match(notifications, /kind === 'dated'/);
assert.match(notifications, /SchedulableTriggerInputTypes\.DATE/);

// H — Migración segura desde 0.2.0 y configuración Android esperada.
assert.match(data, /schedule_mode TEXT NOT NULL DEFAULT 'fixed'/);
assert.match(data, /ALTER TABLE medications ADD COLUMN schedule_mode TEXT NOT NULL DEFAULT 'fixed'/);
assert.match(data, /ALTER TABLE medications ADD COLUMN interval_hours INTEGER/);
assert.match(data, /ALTER TABLE medications ADD COLUMN start_time TEXT/);
assert.match(data, /ALTER TABLE medications ADD COLUMN start_date TEXT NOT NULL DEFAULT '1970-01-01'/);
assert.match(data, /ALTER TABLE medications ADD COLUMN end_date TEXT/);
assert.match(data, /ALTER TABLE medications ADD COLUMN archived INTEGER NOT NULL DEFAULT 0/);
assert.match(data, /WHERE archived = 0/);
assert.match(data, /WHERE archived = 1/);
assert.match(data, /SET archived = \?, active = \?/);
assert.match(data, /ALTER TABLE intakes ADD COLUMN medication_name_snapshot TEXT/);
assert.match(data, /ALTER TABLE intakes ADD COLUMN dose_snapshot TEXT/);
assert.match(data, /ALTER TABLE intakes ADD COLUMN instructions_snapshot TEXT NOT NULL DEFAULT ''/);
assert.match(data, /medication_name_snapshot = COALESCE/);
assert.match(data, /dose_snapshot = COALESCE/);
assert.match(data, /correctHistoryEntry/);
assert.match(data, /CREATE TABLE IF NOT EXISTS stock_movements/);
assert.match(data, /reason TEXT NOT NULL CHECK\(reason IN \('intake','correction','refill','manual'\)\)/);
assert.match(data, /listStockMovements/);
assert.match(data, /addMedicationStock/);
assert.match(data, /setMedicationLowStockThreshold/);
assert.match(data, /Math\.max\(0, currentStock - 1\)/);
assert.match(data, /writeStockMovement/);
assert.match(data, /exportLocalBackup/);
assert.match(data, /validateLocalBackup/);
assert.match(data, /restoreLocalBackup/);
assert.match(data, /format: 'weekflow-pills-backup'/);
assert.match(data, /version: 1/);
assert.match(data, /DELETE FROM stock_movements/);
assert.match(data, /DELETE FROM intakes/);
assert.match(backup, /createPreventiveBackup/);
assert.match(backup, /pickAndRestoreBackup/);
assert.match(backup, /Sharing\.shareAsync/);
assert.equal(pkg.dependencies['expo-file-system'], '~57.0.7');
assert.equal(pkg.dependencies['expo-document-picker'], '~57.0.3');
assert.equal(pkg.dependencies['expo-sharing'], '~57.0.19');
assert.match(bottomNav, /accessibilityRole="tab"/);
assert.match(bottomNav, /minHeight: 64/);
assert.match(today, /accessibilityLabel=/);
assert.match(today, /PENDIENTES AHORA/);
assert.match(today, />v0\.4\.0</);
assert.match(history, /accessibilityState=\{\{ selected: active \}\}/);
assert.match(history, /minHeight: 48/);
assert.match(medications, /accessibilityState=\{\{ selected: active \}\}/);
assert.match(medications, /accessibilityLabel="Crear y guardar respaldo"/);
assert.match(medications, /Eliminar definitivamente/);
assert.match(medications, /Restablecer app/);
assert.match(data, /deleteMedicationPermanently/);
assert.match(data, /resetAllLocalData/);
assert.match(backup, /resetAppToZero/);
assert.match(medications, /day:\{flex:1,minHeight:48/);
assert.equal(appConfig.expo.version, '0.4.1');
assert.equal(appConfig.expo.android.versionCode, 9);
assert.equal(appConfig.expo.android.package, 'com.weekflow.pills');
assert.ok(appConfig.expo.android.permissions.includes('android.permission.SCHEDULE_EXACT_ALARM'));
assert.ok(appConfig.expo.android.permissions.includes('android.permission.RECEIVE_BOOT_COMPLETED'));

console.log('WeekFlow Pills v0.4.1 integration checks F–H + Phases 4.3–4.10: OK');
