import { useEffect } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { BottomNav } from '@/src/components/BottomNav';
import { ensureDatabase } from '@/src/data/medications';
import { useAdaptiveLayout } from '@/src/presentation/layout/useAdaptiveLayout';
import { syncMedicationNotifications } from '@/src/services/notifications';
import { colors } from '@/src/theme/colors';

export default function RootLayout() {
  const { isWide, stageMaxWidth } = useAdaptiveLayout();

  useEffect(() => {
    ensureDatabase();
    void syncMedicationNotifications().catch((error) => {
      console.warn('No se pudieron sincronizar los recordatorios', error);
    });

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncMedicationNotifications().catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, []);

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
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, alignItems: 'center' },
  stage: { flex: 1, width: '100%' },
});
