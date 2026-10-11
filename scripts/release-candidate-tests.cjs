const assert = require('node:assert/strict');
const fs = require('node:fs');

const data = fs.readFileSync('src/data/medications.ts', 'utf8');
const notifications = fs.readFileSync('src/services/notifications.ts', 'utf8');
const backup = fs.readFileSync('src/services/backup.ts', 'utf8');
const workflow = fs.readFileSync('.github/workflows/build-weekflow-pills.yml', 'utf8');
const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

assert.equal(app.expo.version, '0.4.0');
assert.equal(app.expo.android.versionCode, 8);
assert.equal(app.expo.android.package, 'com.weekflow.pills');
assert.equal(pkg.version, '0.4.0');

// Regression guard: schema upgrades must remain additive.
assert.doesNotMatch(data, /DROP\s+TABLE/i);
assert.match(data, /ALTER TABLE medications ADD COLUMN schedule_mode/);
assert.match(data, /ALTER TABLE medications ADD COLUMN interval_hours/);
assert.match(data, /ALTER TABLE medications ADD COLUMN start_time/);
assert.match(data, /ALTER TABLE medications ADD COLUMN start_date/);
assert.match(data, /ALTER TABLE medications ADD COLUMN end_date/);
assert.match(data, /ALTER TABLE medications ADD COLUMN archived/);
assert.match(data, /ALTER TABLE intakes ADD COLUMN medication_name_snapshot/);
assert.match(data, /ALTER TABLE intakes ADD COLUMN dose_snapshot/);
assert.match(data, /ALTER TABLE intakes ADD COLUMN instructions_snapshot/);

// Legacy data compatibility and duplicate protection.
assert.match(data, /DEFAULT 'fixed'/);
assert.match(data, /DEFAULT '1970-01-01'/);
assert.match(data, /DEFAULT 0/);
assert.match(data, /UNIQUE\(medication_id, scheduled_date, scheduled_time\)/);

// v0.4 core safety invariants.
assert.match(notifications, /syncInFlight/);
assert.match(notifications, /duplicateSnooze/);
assert.match(data, /listOutstandingDoses/);
assert.match(data, /correctHistoryEntry/);
assert.match(data, /stock_movements/);
assert.match(data, /exportLocalBackup/);
assert.match(data, /restoreLocalBackup/);
assert.match(backup, /createPreventiveBackup/);

// Release pipeline must preserve the signing safety check.
assert.match(workflow, /Detect permanent signing secrets/);
assert.match(workflow, /Permanent WeekFlow Pills signing secrets are not configured yet/);
assert.match(workflow, /WeekFlow-Pills-v\$\{VERSION\}-Standalone\.apk/);

console.log('WeekFlow Pills 0.4.0 release-candidate regression checks: OK');
