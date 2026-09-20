import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { listMedications } from '@/src/data/medications';

const CHANNEL_ID = 'medication-reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensurePermission() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Recordatorios de medicamentos',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 180, 250],
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function syncMedicationNotifications() {
  const allowed = await ensurePermission();
  if (!allowed) return false;

  await Notifications.cancelAllScheduledNotificationsAsync();

  for (const medication of listMedications(false)) {
    for (const time of medication.times) {
      const [hour, minute] = time.split(':').map(Number);
      const content = {
        title: `Hora de ${medication.name}`,
        body: [medication.dose, medication.instructions].filter(Boolean).join(' · '),
        sound: true,
        data: { medicationId: medication.id },
      };

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
