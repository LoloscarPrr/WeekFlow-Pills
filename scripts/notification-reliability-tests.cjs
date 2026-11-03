const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/services/notifications.ts'), 'utf8');
assert.match(source, /keepOrReplaceReminder\(/);
assert.match(source, /const existingByKey = new Map/);
assert.match(source, /if \(desiredKeys\.has\(key\)\) continue/);
assert.match(source, /legacyRecurring/);
assert.match(source, /duplicateSnooze/);
assert.doesNotMatch(source, /Rebuild only WeekFlow Pills recurring reminders/);

const compiled = ts.transpileModule(source, {
  fileName: 'notifications.ts',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

let medications = [{
  id: 1, name: 'Medicamento de prueba', dose: 'Dosis configurada', instructions: 'Indicaciones',
  times: ['09:00'], days: [0,1,2,3,4,5,6], startDate: '1970-01-01', endDate: null, active: true,
  scheduleMode: 'fixed', intervalHours: null, startTime: null,
}];
let nativeScheduled = [];
let scheduleCalls = 0;
let cancelCalls = 0;
let failNextSchedule = false;
let serial = 1;
const notifications = {
  AndroidImportance: { MAX: 5 },
  SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly', DATE: 'date', TIME_INTERVAL: 'timeInterval' },
  setNotificationHandler() {},
  async setNotificationCategoryAsync() {},
  async setNotificationChannelAsync() {},
  async getPermissionsAsync() { return { granted: true, status: 'granted' }; },
  async requestPermissionsAsync() { return { granted: true, status: 'granted' }; },
  async getAllScheduledNotificationsAsync() { return [...nativeScheduled]; },
  async cancelScheduledNotificationAsync(identifier) {
    cancelCalls++;
    nativeScheduled = nativeScheduled.filter(item => item.identifier !== identifier);
  },
  async scheduleNotificationAsync(request) {
    scheduleCalls++;
    if (failNextSchedule) {
      failNextSchedule = false;
      throw Error('Simulated native scheduling failure');
    }
    const id = 'test-' + serial++;
    nativeScheduled.push({ identifier: id, ...request });
    return id;
  },
};
const data = {
  listMedications() { return medications.filter(x => x.active); },
  getMedicationById(id) { return medications.find(m => m.id === id) ?? null; },
  createOccurrence() { throw Error('not needed for scheduling test'); },
  markNotificationActionHandled() { return true; },
  recordIntake() { throw Error('not needed for scheduling test'); },
};
const domain = {
  resolveMedicationTimes(med) { return med.times; },
  localDateKey(at = new Date()) {
    return String(at.getFullYear()) + '-' + String(at.getMonth()+1).padStart(2,'0')
      + '-' + String(at.getDate()).padStart(2,'0');
  },
  medicationRunsOnDate(med, date) {
    const day = domain.localDateKey(date);
    return med.days.includes(date.getDay()) && day >= med.startDate && (!med.endDate || day <= med.endDate);
  },
  scheduledDateTime(day, time) {
    return new Date(day+'T'+time+':00');
  },
};
const mod = { exports: {} };
vm.runInNewContext(compiled, {
  module: mod, exports: mod.exports, Date, Promise, Map, Set, Number, console,
  require(name) {
    if (name === 'react-native') return { Platform: { OS: 'android' } };
    if (name === 'expo-notifications') return notifications;
    if (name === '@/src/data/medications') return data;
    if (name === '@/src/domain/medication') return domain;
    throw Error('Unexpected native dependency: ' + name);
  },
});
const api = mod.exports;
const managed = () => nativeScheduled.filter(r => r.content.data?.managedBy === 'weekflow-pills'
  && ['dated','recurring'].includes(r.content.data?.kind));

(async () => {
  await api.syncMedicationNotifications();
  assert.equal(managed().length, 1, 'one daily dose is scheduled');
  assert.equal(managed()[0].trigger.type, 'daily');
  const baselineSchedule = scheduleCalls;
  const baselineCancel = cancelCalls;
  await api.syncMedicationNotifications();
  assert.equal(scheduleCalls, baselineSchedule, 'resuming must not re-create valid alarms');
  assert.equal(cancelCalls, baselineCancel, 'resuming must not cancel valid alarms');
  assert.equal(managed().length, 1);

  nativeScheduled.push({ ...nativeScheduled[0], identifier: 'duplicate-legacy-copy' });
  await api.syncMedicationNotifications();
  assert.equal(managed().length, 1, 'duplicate managed alarms are removed');
  assert.equal(scheduleCalls, baselineSchedule, 'no extra schedule to remove duplicates');

  const prior = managed()[0].identifier;
  medications = [{ ...medications[0], dose: 'Dosis actualizada' }];
  await api.syncMedicationNotifications();
  assert.equal(managed().length, 1, 'edited dose leaves one alarm');
  assert.notEqual(managed()[0].identifier, prior, 'edited dose recreates the changed alert');
  assert.match(managed()[0].content.body, /Dosis actualizada/);

  const validAlarm = managed()[0].identifier;
  medications = [{ ...medications[0], dose: 'Dosis nueva temporal' }];
  failNextSchedule = true;
  await assert.rejects(api.syncMedicationNotifications(), /Simulated native scheduling failure/);
  assert.equal(managed()[0].identifier, validAlarm, 'native scheduling errors retain last working alarm');
  await api.syncMedicationNotifications();
  assert.notEqual(managed()[0].identifier, validAlarm, 'next successful sync replaces outdated alert');

  nativeScheduled.push({
    identifier:'snooze-alarm', content:{title:'Pospuesto',data:{
      managedBy:'weekflow-pills', kind:'snooze', notificationKey:'snooze:1:2026-11-03:09:00',
    }},
    trigger:{type:'timeInterval',seconds:600},
  });
  await api.syncMedicationNotifications();
  assert.ok(nativeScheduled.some(r=>r.identifier==='snooze-alarm'), 'snoozed alarm is preserved');

  medications = [{...medications[0], days:[2]}];
  await api.syncMedicationNotifications();
  assert.equal(managed().length, 1, 'weekly plan replaces daily reminder once');
  assert.equal(managed()[0].trigger.type, 'weekly');
  assert.equal(managed()[0].trigger.weekday, 3, 'Tuesday maps to Expo weekday 3');

  const tomorrow = new Date();tomorrow.setDate(tomorrow.getDate()+1);
  const dateKey = domain.localDateKey(tomorrow);
  medications = [{ ...medications[0], days:[0,1,2,3,4,5,6], startDate:dateKey, endDate:dateKey }];
  await api.syncMedicationNotifications();
  assert.equal(managed().length, 1, 'bounded single date creates one dated reminder');
  assert.equal(managed()[0].trigger.type,'date');
  const stableDated = managed()[0].identifier;
  await api.syncMedicationNotifications();
  assert.equal(managed()[0].identifier,stableDated,'bounded dated reminders are not constantly rebuilt');

  medications = [];
  await api.syncMedicationNotifications();
  assert.equal(managed().length, 0, 'removed medications cancel their pending alarms');
  assert.ok(nativeScheduled.some(r=>r.identifier==='snooze-alarm'), 'removing recurring alarms leaves an existing snooze');

  // Old builds used recurring alarms without managedBy or stable IDs.
  const legacy = { identifier:'legacy-old',content:{title:'Old',data:{kind:'recurring'}},trigger:{type:'daily'} };
  nativeScheduled.push(legacy);
  medications = [{
    id:2,name:'Otro',dose:'Una',instructions:'',times:['10:00'],
    days:[0,1,2,3,4,5,6],startDate:'1970-01-01',endDate:null,active:true,
  }];
  await api.syncMedicationNotifications();
  assert.equal(managed().length,1);
  assert.ok(!nativeScheduled.some(r=>r.identifier==='legacy-old'),'old recurring notification removed after replacement');

  console.log('WeekFlow Pills incremental native reminder tests passed.');
})().catch(error=>{ console.error(error);process.exitCode=1; });
