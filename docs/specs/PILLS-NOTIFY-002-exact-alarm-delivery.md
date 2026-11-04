# PILLS-NOTIFY-002 — Timely medication alarms when Android is idle

Status: LOCKED
Phase decision: NOW — verified delayed delivery after 1–2 days idle, short 5-second test still works.
Base: `main` `5f77b9a2938bc8e16d1f7f702a41db9247be91f6`, Pills v0.4.3, Android `com.weekflow.pills`, permanent signing configured.

## Problem
- Expo SDK 57 has no `alarmClock` delivery policy or exact-alarm permission probe in JS.
- Daily/weekly/date reminders can be deferred by Doze/OEM while idle; opening Pills makes alarms appear timely again.
- 5-second time-interval test only checks immediate notifications and does not prove on-time medicine alarms.
- User needs reminders without opening the app every day. For medicine, late delivery can be unsafe.

## Source of truth
- Android AlarmManager documentation: `setAlarmClock` is a user-visible alarm that wakes low-power mode; `setExactAndAllowWhileIdle` is normally punctual but OEMs can defer it.
- Expo 58 docs (released 2026-10-15) adds `delivery: 'alarmClock'` to daily, weekly and DATE triggers, plus `getExactAlarmPermissionsAsync` and `requestExactAlarmPermissionsAsync`.
- Expo 58 requires React Native 0.88, React 19.3.0, matching Expo SDK 58 package versions. Use official `expo/bundledNativeModules.json` mapping.
- Alarm clocks require special Android `SCHEDULE_EXACT_ALARM` permission on Android 12+, already declared in Pills manifest.
- Apps are NOT guaranteed to deliver under force-stop or certain device policies. Physical 24–48h screen-locked testing remains necessary.

## Scope
1. Upgrade Pills SDK 57→58 in a separate branch, preserve SQLite, existing medication/stock/history and app ID/signature; bump Pills 0.4.4 Android versionCode 12.
2. Only use `delivery:'alarmClock'` for recurring/daily/weekly and bounded date medication alerts, not diagnostic short tests or snooze time intervals.
3. Check exact-alarm access; show its actual permission status and allow the user to request it from Android Settings. Do not auto-request at app startup.
4. In existing incremental reconciliation, replace previously scheduled best-effort alarms once (and whenever access changes) using an exactAlarmEnabled/content schema marker. Preserve valid alarm until new one is scheduled; retain duplicate and snooze protections.
5. Provide an opt-in 24-hour date-trigger diagnostic that uses the same alarmClock policy and does not change medicine records.
6. Update mocked native scheduler, release checks and CI. PR Quality and Android build must pass before merge; sign with original permanent key or do not ship.

## Non-goals
- No Android foreground service always-on, unrestricted battery exemption bypass, SMS/cloud push, auto-dosing, phone home or altered medication timing, dosage or backup structure.
- No changes to WeekFlow original, which has less critical lifestyle notifications and is in a different repository.
- No claims that a 5-second test guarantees 48h delivery. No automatic permission grant.

## Acceptance tests
- [ ] A1 `delivery:'alarmClock'` for all scheduled medicine DATE/DAILY/WEEKLY alarms and never for 5-second TIME_INTERVAL or snooze.
- [ ] A2 Exact permission status visible; user-initiated request to system settings; re-sync after grant.
- [ ] A3 Permission change and legacy requests cause exactly one alarm replacement without deleting valid alarms if scheduling fails.
- [ ] A4 Existing times, recurrence, day boundary, dates, medication records, stock, actions, snooze and backups are unchanged.
- [ ] A5 New opt-in 24h real-trigger diagnostic and explicit description that immediate tests do not prove prolonged idle delivery.
- [ ] A6 Expo 58 installation, TypeScript, all existing regression tests and native Android signed APK PASS in GitHub.
- [ ] A7 Physical Moto G20 24/48h idle, reboot and battery test: BLOCKED until user installs and tests on device.

## Roadmap/verification
NOW, scoped to medication reliability. Do not merge if SDK 58 migration/regressions cannot be verified. Keep 0.4.3 as known stable fallback. Technical proof of time correctness requires independent locked-device testing beyond CI.
