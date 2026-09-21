import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { createOccurrence, getMedicationById, listMedications, markNotificationActionHandled, recordIntake } from '@/src/data/medications';
import { localDateKey } from '@/src/domain/medication';

const CHANNEL_ID = 'medication-reminders';
const CATEGORY_ID = 'medicationactions';
const ACTION_TAKEN = 'MARK_TAKEN';
const ACTION_SNOOZE = 'SNOOZE_10';

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

function medicationNotificationContent(medicationId: number, scheduledTime: string, scheduledDate?: string) {
  const medication = getMedicationById(medicationId);
  if (!medication) return null;

  return {
    title: `Hora de ${medication.name}`,
    body: [medication.dose, medication.instructions].filter(Boolean).join(' · '),
    sound: true,
    categoryIdentifier: CATEGORY_ID,
    data: {
      medicationId,
      scheduledTime,
      ...(scheduledDate ? { scheduledDate } : {}),
    },
  } satisfies Notifications.NotificationContentInput;
}

export async function syncMedicationNotifications() {
  const allowed = await ensurePermission();
  if (!allowed) return false;

  await Notifications.cancelAllScheduledNotificationsAsync();

  for (const medication of listMedications(false)) {
    for (const time of medication.times) {
      const [hour, minute] = time.split(':').map(Number);
      const content = medicationNotificationContent(medication.id, time);
      if (!content) continue;

      if (medication.days.length === 7) {
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

export async function handleMedicationNotificationResponse(response: Notifications.NotificationResponse) {
  const action = response.actionIdentifier;
  if (action !== ACTION_TAKEN && action !== ACTION_SNOOZE) return;

  const request = response.notification.request;
  const data = request.content.data;
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

  const content = medicationNotificationContent(medicationId, scheduledTime, scheduledDate);
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

  await Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
}
