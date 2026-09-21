import { useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { DoseOccurrence, IntakeStatus } from '@/src/domain/medication';
import { listLastTakenByMedication, listTodayDoses, recordIntake, type LastTaken } from '@/src/data/medications';
import { colors } from '@/src/theme/colors';

function minutesOf(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function formatRecordedTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

function lastTakenLabel(last: LastTaken | undefined) {
  if (!last) return 'Sin tomas registradas todavía';
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const prefix = last.scheduledDate === todayKey ? 'Hoy' : last.scheduledDate;
  return `Última toma: ${prefix} · ${formatRecordedTime(last.recordedAt)}`;
}

export default function TodayScreen() {
  const [doses, setDoses] = useState<DoseOccurrence[]>([]);
  const [lastTaken, setLastTaken] = useState<Record<number, LastTaken>>({});

  const refresh = () => {
    setDoses(listTodayDoses());
    setLastTaken(listLastTakenByMedication());
  };

  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, []);

  const nextDose = useMemo(() => {
    const pending = doses.filter((item) => item.status === null);
    if (!pending.length) return null;
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return pending.find((item) => minutesOf(item.scheduledTime) >= nowMinutes) ?? pending[0];
  }, [doses]);

  const commitStatus = (dose: DoseOccurrence, status: IntakeStatus) => {
    const result = recordIntake(dose, status);
    refresh();

    if (result === 'unchanged') {
      Alert.alert(
        status === 'taken' ? 'Ya estaba registrado' : 'Ya estaba omitido',
        'No se creó un registro duplicado.',
      );
    }
  };

  const save = (dose: DoseOccurrence, status: IntakeStatus) => {
    if (dose.status === status) {
      commitStatus(dose, status);
      return;
    }

    if (dose.status && dose.status !== status) {
      Alert.alert(
        'Corregir registro',
        dose.status === 'taken'
          ? 'Esta toma figura como tomada. ¿Quieres cambiarla a omitida?'
          : 'Esta toma figura como omitida. ¿Quieres cambiarla a tomada?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Sí, corregir', onPress: () => commitStatus(dose, status) },
        ],
      );
      return;
    }

    if (status === 'taken') {
      Alert.alert(
        'Confirmar toma',
        `¿Confirmas que se tomó ${dose.medication.name} · ${dose.medication.dose}?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Sí, registrar', onPress: () => commitStatus(dose, status) },
        ],
      );
      return;
    }

    Alert.alert(
      'Marcar como omitido',
      'Esto solo registra el estado. La app no indica si corresponde tomar una dosis más tarde.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Registrar omitido', onPress: () => commitStatus(dose, status) },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.top}>
          <View>
            <Text style={styles.brand}>WeekFlow</Text>
            <Text style={styles.brandSub}>PILLS</Text>
          </View>
          <View style={styles.version}><Text style={styles.versionText}>Alpha 0.2.0</Text></View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>HOY</Text>
          <Text style={styles.title}>Medicamentos de hoy</Text>
          <Text style={styles.subtitle}>Solo lo que toca hoy, sin ruido.</Text>
        </View>

        <View style={styles.nextCard}>
          <Text style={styles.nextLabel}>{nextDose ? 'PRÓXIMA TOMA' : 'ESTADO DE HOY'}</Text>
          {nextDose ? (
            <>
              <Text style={styles.nextTime}>{nextDose.scheduledTime}</Text>
              <Text style={styles.nextName}>{nextDose.medication.name}</Text>
              <Text style={styles.nextDose}>{nextDose.medication.dose}</Text>
              <Text style={styles.lastTaken}>{lastTakenLabel(lastTaken[nextDose.medication.id])}</Text>
              {nextDose.medication.instructions ? (
                <Text style={styles.nextInstructions}>{nextDose.medication.instructions}</Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.doneTitle}>{doses.length ? 'Todo está registrado' : 'Sin tomas programadas'}</Text>
              <Text style={styles.doneCopy}>
                {doses.length ? 'No quedan medicamentos pendientes para hoy.' : 'Agrega el primer medicamento desde la pestaña Medicamentos.'}
              </Text>
            </>
          )}
        </View>

        <Text style={styles.section}>TOMAS DEL DÍA</Text>
        {doses.length ? doses.map((item) => (
          <View key={`${item.medication.id}-${item.scheduledTime}`} style={styles.doseCard}>
            <View style={styles.doseHead}>
              <Text style={styles.time}>{item.scheduledTime}</Text>
              <View style={[styles.statusPill, item.status === 'taken' && styles.statusTaken, item.status === 'skipped' && styles.statusSkipped]}>
                <Text style={[styles.statusText, item.status === 'taken' && styles.statusTakenText, item.status === 'skipped' && styles.statusSkippedText]}>
                  {item.status === 'taken' ? 'Tomado' : item.status === 'skipped' ? 'Omitido' : 'Pendiente'}
                </Text>
              </View>
            </View>
            <Text style={styles.medName}>{item.medication.name}</Text>
            <Text style={styles.medDose}>{item.medication.dose}</Text>
            <Text style={styles.lastDoseLine}>{lastTakenLabel(lastTaken[item.medication.id])}</Text>
            {item.status === 'taken' && item.recordedAt ? (
              <Text style={styles.recordedLine}>Esta toma se registró a las {formatRecordedTime(item.recordedAt)}</Text>
            ) : null}
            {item.medication.instructions ? <Text style={styles.instructions}>{item.medication.instructions}</Text> : null}

            {item.medication.stock !== null && item.medication.stock <= item.medication.lowStockThreshold ? (
              <Text style={styles.lowStock}>Quedan {item.medication.stock} unidades · stock bajo</Text>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                style={[styles.action, styles.takenButton, item.status === 'taken' && styles.takenButtonDone]}
                onPress={() => save(item, 'taken')}
              >
                <Text style={styles.takenButtonText}>{item.status === 'taken' ? '✓ Registrado' : '✓ Tomado'}</Text>
              </Pressable>
              <Pressable style={styles.action} onPress={() => save(item, 'skipped')}>
                <Text style={styles.skipButtonText}>{item.status === 'skipped' ? 'Omitido ✓' : 'Omitir'}</Text>
              </Pressable>
            </View>
          </View>
        )) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Todavía no hay nada aquí</Text>
            <Text style={styles.emptyCopy}>Configura un medicamento y sus horarios para comenzar.</Text>
          </View>
        )}

        <View style={styles.safety}>
          <Text style={styles.safetyTitle}>Importante</Text>
          <Text style={styles.safetyCopy}>WeekFlow Pills registra y recuerda lo que ingreses. No cambia dosis ni indica qué hacer ante una toma olvidada.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 22, paddingBottom: 28 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: colors.text, fontSize: 20, fontWeight: '900', letterSpacing: 0.3 },
  brandSub: { color: '#76AFFF', fontSize: 10, fontWeight: '900', letterSpacing: 4, marginTop: 2 },
  version: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  versionText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  hero: { marginTop: 28, marginBottom: 16 },
  eyebrow: { color: '#76AFFF', fontSize: 13, fontWeight: '900', letterSpacing: 4 },
  title: { color: colors.text, fontSize: 29, lineHeight: 35, fontWeight: '900', marginTop: 7 },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 6 },
  nextCard: { backgroundColor: '#102A4D', borderRadius: 26, borderWidth: 1, borderColor: '#2A5D99', padding: 20 },
  nextLabel: { color: '#76AFFF', fontSize: 12, fontWeight: '900', letterSpacing: 2.5 },
  nextTime: { color: colors.text, fontSize: 42, lineHeight: 49, fontWeight: '900', marginTop: 10 },
  nextName: { color: colors.text, fontSize: 21, fontWeight: '900', marginTop: 2 },
  nextDose: { color: '#A9CFFF', fontSize: 15, fontWeight: '800', marginTop: 4 },
  lastTaken: { color: '#7DE1C1', fontSize: 12, fontWeight: '800', marginTop: 10 },
  nextInstructions: { color: '#C2D0E3', fontSize: 13, lineHeight: 19, marginTop: 10 },
  doneTitle: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 14 },
  doneCopy: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  section: { color: '#76AFFF', fontSize: 13, fontWeight: '900', letterSpacing: 3, marginTop: 28, marginBottom: 11 },
  doseCard: { backgroundColor: colors.surface, borderRadius: 23, borderWidth: 1, borderColor: colors.line, padding: 17, marginBottom: 11 },
  doseHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { color: '#76AFFF', fontSize: 19, fontWeight: '900' },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surface2 },
  statusTaken: { backgroundColor: '#103B35' },
  statusSkipped: { backgroundColor: '#3B2027' },
  statusText: { color: colors.muted, fontSize: 11, fontWeight: '900' },
  statusTakenText: { color: '#7DE1C1' },
  statusSkippedText: { color: '#FF9AA4' },
  medName: { color: colors.text, fontSize: 19, fontWeight: '900', marginTop: 13 },
  medDose: { color: '#B8C9E0', fontSize: 14, fontWeight: '800', marginTop: 3 },
  lastDoseLine: { color: '#8DB7EF', fontSize: 11, fontWeight: '800', marginTop: 8 },
  recordedLine: { color: '#7DE1C1', fontSize: 11, marginTop: 4 },
  instructions: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 8 },
  lowStock: { color: colors.warning, fontSize: 12, fontWeight: '900', marginTop: 10 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 16 },
  action: { flex: 1, minHeight: 48, borderRadius: 15, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  takenButton: { backgroundColor: colors.blue, borderColor: colors.blue },
  takenButtonDone: { backgroundColor: '#145246', borderColor: '#2F7567' },
  takenButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  skipButtonText: { color: colors.muted, fontSize: 14, fontWeight: '900' },
  emptyCard: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.line, padding: 20 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  emptyCopy: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  safety: { marginTop: 24, borderRadius: 18, backgroundColor: '#111C30', padding: 15 },
  safetyTitle: { color: '#C5D5E9', fontSize: 12, fontWeight: '900' },
  safetyCopy: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 4 },
});
