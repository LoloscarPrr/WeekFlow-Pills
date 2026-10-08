import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  createOccurrence,
  getMedicationById,
  listMedications,
  markNotificationActionHandled,
  recordIntake,
} from '@/src/data/medications';
import { localDateKey, resolveMedicationTimes } from '@/src/domain/medication';

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
  options?: { scheduledDate?: string; notificationKey?: string },
) {
  const medication = getMedicationById(medicationId);
  if (!medication) return null;

  const scheduledDate = options?.scheduledDate;
  return {
    title: `Hora de ${medication.name}`,
    body: [medication.dose, medication.instructions].filter(Boolean).join(' · '),
    sound: true,
    categoryIdentifier: CATEGORY_ID,
    data: {
      managedBy: MANAGED_BY,
      medicationId,
      scheduledTime,
      kind: scheduledDate ? 'snooze' : 'recurring',
      ...(scheduledDate ? { scheduledDate } : {}),
      ...(options?.notificationKey ? { notificationKey: options.notificationKey } : {}),
    },
  } satisfies Notifications.NotificationContentInput;
}

async function performSync() {
  const allowed = await ensurePermission();
  if (!allowed) return false;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();

  // Rebuild only WeekFlow Pills recurring reminders. Snoozes are intentionally preserved.
  for (const request of scheduled) {
    const data = request.content.data ?? {};
    const managedBy = data.managedBy;
    const kind = data.kind;

    // Old WeekFlow Pills builds did not include managedBy. Their recurring notifications
    // still carry kind=recurring, so remove them once to avoid duplicate alerts.
    const isLegacyRecurring = managedBy === undefined && kind === 'recurring';
    const isManagedRecurring = managedBy === MANAGED_BY && kind === 'recurring';

    if (isLegacyRecurring || isManagedRecurring) {
      await Notifications.cancelScheduledNotificationAsync(request.identifier);
    }
  }

  const desiredKeys = new Set<string>();

  for (const medication of listMedications(false)) {
    for (const time of resolveMedicationTimes(medication)) {
      const [hour, minute] = time.split(':').map(Number);

      if (medication.days.length === 7) {
        const key = notificationKey(medication.id, time);
        if (desiredKeys.has(key)) continue;
        desiredKeys.add(key);

        const content = medicationNotificationContent(medication.id, time, { notificationKey: key });
        if (!content) continue;

        await Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour,
            minute,
            channelId: CHANNEL_ID,
          },
        });
      } else {
        for (const day of medication.days) {
          const key = notificationKey(medication.id, time, day);
          if (desiredKeys.has(key)) continue;
          desiredKeys.add(key);

          const content = medicationNotificationContent(medication.id, time, { notificationKey: key });
          if (!content) continue;

          await Notifications.scheduleNotificationAsync({
            content,
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
              weekday: day + 1,
              hour,
              minute,
              channelId: CHANNEL_ID,
            },
          });
        }
      }
    }
  }

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

export async function getMedicationReminderDiagnostics() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const managed = scheduled.filter((request) => request.content.data?.managedBy === MANAGED_BY);
  return {
    totalManaged: managed.length,
    recurring: managed.filter((request) => request.content.data?.kind === 'recurring').length,
    snoozed: managed.filter((request) => request.content.data?.kind === 'snooze').length,
  };
}
