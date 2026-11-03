# PILLS-NOTIFY-001 — Reliability and Android notification diagnostics

Status: LOCKED
Base: `main` `223f83b1feeb427e1e816450832b64e967ca2bb7` · app v0.4.2
Scope: incremental local alarm reconciliation and clearly visible permission diagnostics. Preserve all existing medications, intake history, snoozes, SQLite migrations, notification action keys and app ID/signing.

## Confirmed code issues
- Every foreground/startup sync cancels all recurring/dated notifications before recreating them, opening gaps on failure.
- Android's exact alarm access can be denied by default on Android 14+, but the current diagnostics only checks POST_NOTIFICATIONS.
- The latest Android workflow fails before packaging because `scripts/validate-v030.cjs` expects the old v0.4.1 label.
- Scheduling 90 days of date-bounded doses can be expensive. Do not change the intended horizon in this limited fix.

## Acceptance
1. Keep matching scheduled daily, weekly and dated alarms across foreground sync; cancel stale ones, detect duplicates, preserve snoozes. Changes to name/dose update alert content.
2. Only remove a replaced alarm after its successor schedules successfully; avoid a gap during failed reschedule.
3. Preserve medication date boundaries, times, all seven-day/week selection, stock/intakes and action deduplication.
4. Expose actionable guidance to allow notifications, alarm access and battery/background operation. No claim that permission implies real delivery.
5. Existing release-candidate tests pass with current 0.4.2 label, plus tests covering reconciliation.
6. Build with permanent signing if configured; do not ship a differently signed APK as upgrade over user's existing installation.
7. Physical phone alarm test with screen locked, in background and after reboot required before claiming reliable delivery.
