import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  createOccurrence,
  getMedicationById,
  listMedications,
  markNotificationActionHandled,
  recordIntake,
} from '@/src/data/medications';
import { localDateKey, medicationRunsOnDate, resolveMedicationTimes, scheduledDateTime } from '@/src/domain/medication';

const CHANNEL_ID = 'medication-reminders';
const CATEGORY_ID = 'medicationactions';
const ACTION_TAKEN = 'MARK_TAKEN';
const ACTION_SNOOZE = 'SNOOZE_10';
const MANAGED_BY = 'weekflow-pills';

let syncInFlight: Promise<boolean> | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureCategory() {
  await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
    {
      identifier: ACTION_TAKEN,
      buttonTitle: 'Tomado',
      options: { opensAppToForeground: true },
    },
    {
      identifier: ACTION_SNOOZE,
      buttonTitle: 'Posponer 10 min',
      options: { opensAppToForeground: true },
    },
  ]);
}

async function ensurePermission() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Recordatorios de medicamentos',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 180, 250],
      sound: 'default',
    });
  }

  await ensureCategory();

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

function notificationKey(medicationId: number, scheduledTime: string, weekday?: number) {
  return weekday === undefined
    ? `daily:${medicationId}:${scheduledTime}`
    : `weekly:${medicationId}:${weekday}:${scheduledTime}`;
}

function medicationNotificationContent(
  medicationId: number,
  scheduledTime: string,
  options?: { scheduledDate?: string; notificationKey?: string; exactAlarmEnabled?: boolean },
) {
  const medication = getMedicationById(medicationId);
  if (!medication) return null;

  const scheduledDate = options?.scheduledDate;
  const kind = scheduledDate ? (options?.notificationKey?.startsWith('snooze:') ? 'snooze' : 'dated') : 'recurring';
  return {
    title: `Hora de ${medication.name}`,
    body: [medication.dose, medication.instructions].filter(Boolean).join(' · '),
    sound: true,
    categoryIdentifier: CATEGORY_ID,
    data: {
      managedBy: MANAGED_BY,
      medicationId,
      scheduledTime,
      kind,
      ...(scheduledDate ? { scheduledDate } : {}),
      ...(options?.notificationKey ? { notificationKey: options.notificationKey } : {}),
      ...(kind !== 'snooze' ? { exactAlarmEnabled: options?.exactAlarmEnabled ?? false } : {}),
    },
  } satisfies Notifications.NotificationContentInput;
}

type ScheduledRequest = Awaited<ReturnType<typeof Notifications.getAllScheduledNotificationsAsync>>[number];

/**
 * Preserve a matching native alarm rather than cancelling and rebuilding it
 * whenever Android resumes the app. For changed content, schedule the new
 * request first and remove the old one only after scheduling succeeds.
 */
async function keepOrReplaceReminder(
  key: string,
  content: Notifications.NotificationContentInput,
  trigger: Notifications.NotificationTriggerInput,
  existingByKey: Map<string, ScheduledRequest[]>,
): Promise<void> {
  const existing = existingByKey.get(key) ?? [];
  const matching = existing.find((request) =>
    request.content.title === content.title
    && request.content.body === content.body
    && request.content.data?.kind === content.data?.kind
    && request.content.data?.exactAlarmEnabled === content.data?.exactAlarmEnabled
  );
  if (matching) {
    // Leave the functioning alarm in place; clear only duplicates.
    await Promise.all(existing.filter((request) => request.identifier !== matching.identifier)
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));
    return;
  }
  await Notifications.scheduleNotificationAsync({ content, trigger });
  // In case of a scheduling failure, existing alarms are not removed.
  await Promise.all(existing.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));
}

async function performSync() {
  const allowed = await ensurePermission();
  if (!allowed) return false;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const existingByKey = new Map<string, ScheduledRequest[]>();
  const legacyRecurring: ScheduledRequest[] = [];
  for (const request of scheduled) {
    const data = request.content.data ?? {};
    // Preserve snoozes: their delivery is independent from the recurring plan.
    if (data.managedBy === MANAGED_BY && (data.kind === 'recurring' || data.kind === 'dated')) {
      const key = data.notificationKey;
      if (typeof key === 'string') {
        existingByKey.set(key, [...(existingByKey.get(key) ?? []), request]);
      } else {
        legacyRecurring.push(request);
      }
    } else if (data.managedBy === undefined && data.kind === 'recurring') {
      // Legacy schedule has no stable ID; replace only once the new plan is created.
      legacyRecurring.push(request);
    }
  }

  const desiredKeys = new Set<string>();

  const now = new Date();
  const todayKey = localDateKey(now);
  const exactAlarmEnabled = (await Notifications.getExactAlarmPermissionsAsync()).granted;

  for (const medication of listMedications(false)) {
    const times = resolveMedicationTimes(medication);
    const hasDateBoundary = medication.startDate > todayKey || medication.endDate !== null;

    if (hasDateBoundary) {
      const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 90);
      for (let offset = 0; offset <= 90; offset += 1) {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
        if (date > horizon) break;
        if (!medicationRunsOnDate(medication, date)) continue;
        const dateKey = localDateKey(date);

        for (const time of times) {
          const when = scheduledDateTime(dateKey, time);
          if (when.getTime() <= now.getTime()) continue;
          const key = `dated:${medication.id}:${dateKey}:${time}`;
          if (desiredKeys.has(key)) continue;
          desiredKeys.add(key);

          const content = medicationNotificationContent(medication.id, time, {
            scheduledDate: dateKey,
            notificationKey: key,
            exactAlarmEnabled,
          });
          if (!content) continue;

          await keepOrReplaceReminder(key, content, {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            delivery: 'alarmClock',
            date: when,
            channelId: CHANNEL_ID,
          }, existingByKey);
        }
      }
      continue;
    }

    for (const time of times) {
      const [hour, minute] = time.split(':').map(Number);

      if (medication.days.length === 7) {
        const key = notificationKey(medication.id, time);
        if (desiredKeys.has(key)) continue;
        desiredKeys.add(key);
        const content = medicationNotificationContent(medication.id, time, { notificationKey: key, exactAlarmEnabled });
        if (!content) continue;
        await keepOrReplaceReminder(key, content, {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
            delivery: 'alarmClock',
          hour,
          minute,
          channelId: CHANNEL_ID,
        }, existingByKey);
      } else {
        for (const day of medication.days) {
          const key = notificationKey(medication.id, time, day);
          if (desiredKeys.has(key)) continue;
          desiredKeys.add(key);
          const content = medicationNotificationContent(medication.id, time, { notificationKey: key, exactAlarmEnabled });
          if (!content) continue;
          await keepOrReplaceReminder(key, content, {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            delivery: 'alarmClock',
            weekday: day + 1,
            hour,
            minute,
            channelId: CHANNEL_ID,
          }, existingByKey);
        }
      }
    }
  }

  // Reconcile removed/disabled/edited medications only after the new plan has
  // been safely scheduled. If anything above throws, older valid alarms stay.
  for (const [key, requests] of existingByKey) {
    if (desiredKeys.has(key)) continue;
    await Promise.all(requests.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));
  }
  await Promise.all(legacyRecurring.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));

  return true;
}

export async function syncMedicationNotifications() {
  // Prevent overlapping startup/foreground/edit syncs from producing duplicate schedules.
  if (syncInFlight) return syncInFlight;

  syncInFlight = performSync().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}

export async function handleMedicationNotificationResponse(response: Notifications.NotificationResponse) {
  const action = response.actionIdentifier;
  if (action !== ACTION_TAKEN && action !== ACTION_SNOOZE) return;

  const request = response.notification.request;
  const data = request.content.data ?? {};
  const medicationId = Number(data.medicationId);
  const scheduledTime = typeof data.scheduledTime === 'string' ? data.scheduledTime : null;
  if (!Number.isInteger(medicationId) || !scheduledTime) return;

  const notificationDate = new Date(response.notification.date);
  const scheduledDate = typeof data.scheduledDate === 'string'
    ? data.scheduledDate
    : localDateKey(notificationDate);

  const actionKey = `${request.identifier}:${action}:${response.notification.date}`;
  if (!markNotificationActionHandled(actionKey)) return;

  if (action === ACTION_TAKEN) {
    const occurrence = createOccurrence(medicationId, scheduledDate, scheduledTime);
    if (!occurrence) return;
    recordIntake(occurrence, 'taken');
    await Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    return;
  }

  const snoozeKey = `snooze:${medicationId}:${scheduledDate}:${scheduledTime}`;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const duplicateSnooze = scheduled.some((item) => {
    const snoozeData = item.content.data ?? {};
    return snoozeData.managedBy === MANAGED_BY
      && snoozeData.kind === 'snooze'
      && snoozeData.notificationKey === snoozeKey;
  });

  if (!duplicateSnooze) {
    const content = medicationNotificationContent(medicationId, scheduledTime, {
      scheduledDate,
      notificationKey: snoozeKey,
    });
    if (!content) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        ...content,
        title: `Recordatorio: ${content.title}`,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 10 * 60,
        repeats: false,
        channelId: CHANNEL_ID,
      },
    });
  }

  await Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
}

export type MedicationReminderDiagnostics = {
  permissionGranted: boolean;
  permissionStatus: Notifications.PermissionStatus;
  exactAlarmGranted: boolean;
  totalManaged: number;
  recurring: number;
  dated: number;
  snoozed: number;
};

export async function getMedicationReminderDiagnostics(): Promise<MedicationReminderDiagnostics> {
  const permission = await Notifications.getPermissionsAsync();
  const exactAlarm = await Notifications.getExactAlarmPermissionsAsync();
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const managed = scheduled.filter((request) => request.content.data?.managedBy === MANAGED_BY);
  return {
    permissionGranted: permission.granted,
    permissionStatus: permission.status,
    exactAlarmGranted: exactAlarm.granted,
    totalManaged: managed.length,
    recurring: managed.filter((request) => request.content.data?.kind === 'recurring').length,
    dated: managed.filter((request) => request.content.data?.kind === 'dated').length,
    snoozed: managed.filter((request) => request.content.data?.kind === 'snooze').length,
  };
}

/** The Android special access is never requested automatically during startup. */
export async function requestMedicationExactAlarmPermission(): Promise<boolean> {
  const status = await Notifications.requestExactAlarmPermissionsAsync();
  if (status.granted) {
    await syncMedicationNotifications();
  }
  return status.granted;
}

/** A same-mechanism test for long idle periods, separate from any medication. */
export async function scheduleMedicationLongIdleTest(now = new Date()): Promise<Date> {
  const permission = await Notifications.getPermissionsAsync();
  const exact = await Notifications.getExactAlarmPermissionsAsync();
  if (!permission.granted || !exact.granted) {
    throw new Error('Activa notificaciones y alarmas exactas antes de probar la entrega tras 24 horas.');
  }
  const at = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  const oldTests = existing.filter(request =>
    request.content.data?.managedBy === MANAGED_BY
    && request.content.data?.kind === 'long-idle-test'
  );
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Prueba de 24 horas · WeekFlow Pills',
      body: 'Esta prueba usó el mismo modo de alarma que los recordatorios de medicamentos.',
      sound: true,
      data: { managedBy: MANAGED_BY, kind: 'long-idle-test' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: at,
      delivery: 'alarmClock',
      channelId: CHANNEL_ID,
    },
  });
  // Schedule first: old diagnostic stays if Android rejects the replacement.
  await Promise.all(oldTests.map(request => Notifications.cancelScheduledNotificationAsync(request.identifier)));
  return at;
}

export async function scheduleNotificationDiagnosticTest(delaySeconds = 5) {
  if (!Number.isInteger(delaySeconds) || delaySeconds < 1 || delaySeconds > 60) {
    throw new Error('El retraso de prueba debe estar entre 1 y 60 segundos.');
  }

  const allowed = await ensurePermission();
  if (!allowed) {
    throw new Error('Las notificaciones no tienen permiso en este teléfono.');
  }

  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Prueba de WeekFlow Pills',
      body: 'Si ves y escuchas esto, las notificaciones locales están funcionando.',
      sound: true,
      data: {
        managedBy: MANAGED_BY,
        kind: 'diagnostic-test',
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: delaySeconds,
      repeats: false,
      channelId: CHANNEL_ID,
    },
  });
}
