import { useEffect, useState } from 'react';
import { AppState, Image, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as ExpoSplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { BottomNav } from '@/src/components/BottomNav';
import { ensureDatabase } from '@/src/data/medications';
import { useAdaptiveLayout } from '@/src/presentation/layout/useAdaptiveLayout';
import { handleMedicationNotificationResponse, syncMedicationNotifications } from '@/src/services/notifications';
import { colors } from '@/src/theme/colors';

void ExpoSplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const { isWide, stageMaxWidth } = useAdaptiveLayout();
  const [showBrandSplash, setShowBrandSplash] = useState(true);

  useEffect(() => {
    ensureDatabase();

    void syncMedicationNotifications().catch((error) => {
      console.warn('No se pudieron sincronizar los recordatorios', error);
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleMedicationNotificationResponse(response).catch((error) => {
        console.warn('No se pudo procesar la acción del recordatorio', error);
      });
    });

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        return handleMedicationNotificationResponse(response);
      })
      .catch(() => undefined);

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncMedicationNotifications().catch(() => undefined);
      }
    });

    void ExpoSplashScreen.hideAsync().catch(() => undefined);
    const splashTimer = setTimeout(() => setShowBrandSplash(false), 950);

    return () => {
      clearTimeout(splashTimer);
      responseSubscription.remove();
      appStateSubscription.remove();
    };
  }, []);

  if (showBrandSplash) {
    return (
      <View style={styles.brandSplash}>
        <StatusBar style="light" />
        <Image source={require('../assets/splash.png')} style={styles.brandSplashImage} resizeMode="cover" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.content}>
        <View style={[styles.stage, isWide && { maxWidth: stageMaxWidth }]}>
          <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
        </View>
      </View>
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  brandSplash: { flex: 1, backgroundColor: '#2A1450' },
  brandSplashImage: { width: '100%', height: '100%' },
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, alignItems: 'center' },
  stage: { flex: 1, width: '100%' },
});
