import { useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doseTimingState, localDateKey, type DoseOccurrence, type DoseTimingState, type IntakeStatus } from '@/src/domain/medication';
import {
  listLastTakenByMedication,
  listOutstandingDoses,
  listTodayDoses,
  recordIntake,
  type LastTaken,
} from '@/src/data/medications';
import { colors } from '@/src/theme/colors';

function formatRecordedTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

function formatScheduledDate(dateKey: string) {
  const today = localDateKey();
  if (dateKey === today) return 'Hoy';
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'short',
  });
}

function lastTakenLabel(last: LastTaken | undefined) {
  if (!last) return 'Sin tomas registradas todavía';
  const prefix = last.scheduledDate === localDateKey() ? 'Hoy' : formatScheduledDate(last.scheduledDate);
  return `Última toma: ${prefix} · ${formatRecordedTime(last.recordedAt)}`;
}

function stateLabel(state: DoseTimingState, dose: DoseOccurrence) {
  if (state === 'taken') return dose.recordedAt ? `Tomada · ${formatRecordedTime(dose.recordedAt)}` : 'Tomada';
  if (state === 'skipped') return 'Omitida';
  if (state === 'overdue') return `Atrasada · desde ${dose.scheduledTime}`;
  if (state === 'pending') return 'Pendiente';
  return `Próxima · ${dose.scheduledTime}`;
}

function sortBySchedule(a: DoseOccurrence, b: DoseOccurrence) {
  return `${a.scheduledDate}T${a.scheduledTime}`.localeCompare(`${b.scheduledDate}T${b.scheduledTime}`);
}

export default function TodayScreen() {
  const [doses, setDoses] = useState<DoseOccurrence[]>([]);
  const [outstanding, setOutstanding] = useState<DoseOccurrence[]>([]);
  const [lastTaken, setLastTaken] = useState<Record<number, LastTaken>>({});
  const [clock, setClock] = useState(() => new Date());

  const refresh = () => {
    const now = new Date();
    setClock(now);
    setDoses(listTodayDoses(now));
    setOutstanding(listOutstandingDoses(now, 7));
    setLastTaken(listLastTakenByMedication());
  };

  useEffect(() => {
    refresh();
    const timer = setInterval(() => setClock(new Date()), 30_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  const groups = useMemo(() => {
    const overdueToday = doses.filter((item) => doseTimingState(item, clock) === 'overdue');
    const pendingToday = doses.filter((item) => doseTimingState(item, clock) === 'pending');
    const upcoming = doses.filter((item) => doseTimingState(item, clock) === 'upcoming');
    const resolved = doses.filter((item) => ['taken', 'skipped'].includes(doseTimingState(item, clock)));
    const previousUnresolved = outstanding.filter((item) => item.scheduledDate !== localDateKey(clock));

    return {
      overdueToday: overdueToday.sort(sortBySchedule),
      pendingToday: pendingToday.sort(sortBySchedule),
      upcoming: upcoming.sort(sortBySchedule),
      resolved: resolved.sort(sortBySchedule),
      previousUnresolved: previousUnresolved.sort(sortBySchedule),
    };
  }, [doses, outstanding, clock]);

  const focusDose = useMemo(() => {
    if (groups.previousUnresolved.length) return groups.previousUnresolved[0];
    if (groups.overdueToday.length) return groups.overdueToday[0];
    if (groups.pendingToday.length) return groups.pendingToday[0];
    if (groups.upcoming.length) return groups.upcoming[0];
    return null;
  }, [groups]);

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

  const renderDoseCard = (item: DoseOccurrence, compact = false) => {
    const state = doseTimingState(item, clock);
    return (
      <View
        key={`${item.medication.id}-${item.scheduledDate}-${item.scheduledTime}`}
        style={[
          styles.doseCard,
          state === 'overdue' && styles.doseCardOverdue,
          state === 'taken' && styles.doseCardResolved,
          state === 'skipped' && styles.doseCardResolved,
        ]}
      >
        <View style={styles.doseHead}>
          <View>
            <Text style={styles.time}>{item.scheduledTime}</Text>
            {item.scheduledDate !== localDateKey(clock) ? (
              <Text style={styles.dateTag}>{formatScheduledDate(item.scheduledDate)}</Text>
            ) : null}
          </View>
          <View
            style={[
              styles.statusPill,
              state === 'overdue' && styles.statusOverdue,
              state === 'taken' && styles.statusTaken,
              state === 'skipped' && styles.statusSkipped,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                state === 'overdue' && styles.statusOverdueText,
                state === 'taken' && styles.statusTakenText,
                state === 'skipped' && styles.statusSkippedText,
              ]}
            >
              {stateLabel(state, item)}
            </Text>
          </View>
        </View>

        <Text style={styles.medName}>{item.medication.name}</Text>
        <Text style={styles.medDose}>{item.medication.dose}</Text>

        {!compact ? (
          <>
            <Text style={styles.lastDoseLine}>{lastTakenLabel(lastTaken[item.medication.id])}</Text>
            {item.medication.instructions ? <Text style={styles.instructions}>{item.medication.instructions}</Text> : null}
            {item.medication.stock !== null && item.medication.stock <= item.medication.lowStockThreshold ? (
              <Text style={styles.lowStock}>Quedan {item.medication.stock} unidades · stock bajo</Text>
            ) : null}
          </>
        ) : null}

        {(state === 'upcoming' || state === 'pending' || state === 'overdue') ? (
          <View style={styles.actions}>
            <Pressable style={[styles.action, styles.takenButton]} onPress={() => save(item, 'taken')}>
              <Text style={styles.takenButtonText}>✓ Tomado</Text>
            </Pressable>
            <Pressable style={styles.action} onPress={() => save(item, 'skipped')}>
              <Text style={styles.skipButtonText}>Omitir</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  const focusState = focusDose ? doseTimingState(focusDose, clock) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.top}>
          <View>
            <Text style={styles.brand}>WeekFlow</Text>
            <Text style={styles.brandSub}>PILLS</Text>
          </View>
          <View style={styles.version}><Text style={styles.versionText}>v0.4 · fase 4.2</Text></View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>HOY</Text>
          <Text style={styles.title}>Tu día, de un vistazo</Text>
          <Text style={styles.subtitle}>Primero lo pendiente. Después, lo que viene.</Text>
        </View>

        <View style={[styles.nowCard, focusState === 'overdue' && styles.nowCardOverdue]}>
          <Text style={[styles.nowLabel, focusState === 'overdue' && styles.nowLabelOverdue]}>AHORA</Text>
          {focusDose ? (
            <>
              <Text style={styles.nowStatus}>{stateLabel(focusState!, focusDose)}</Text>
              <Text style={styles.nowTime}>{focusDose.scheduledTime}</Text>
              <Text style={styles.nowName}>{focusDose.medication.name}</Text>
              <Text style={styles.nowDose}>{focusDose.medication.dose}</Text>
              {focusDose.scheduledDate !== localDateKey(clock) ? (
                <Text style={styles.nowPrevious}>Programada para {formatScheduledDate(focusDose.scheduledDate)}</Text>
              ) : null}
              <Text style={styles.lastTaken}>{lastTakenLabel(lastTaken[focusDose.medication.id])}</Text>
              {focusDose.medication.instructions ? (
                <Text style={styles.nowInstructions}>{focusDose.medication.instructions}</Text>
              ) : null}
              <View style={styles.actions}>
                <Pressable style={[styles.action, styles.takenButton]} onPress={() => save(focusDose, 'taken')}>
                  <Text style={styles.takenButtonText}>✓ TOMADO</Text>
                </Pressable>
                <Pressable style={styles.action} onPress={() => save(focusDose, 'skipped')}>
                  <Text style={styles.skipButtonText}>OMITIR</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.doneTitle}>{doses.length ? 'Todo está resuelto por ahora' : 'Sin tomas programadas'}</Text>
              <Text style={styles.doneCopy}>
                {doses.length ? 'No quedan tomas pendientes para este momento.' : 'Agrega el primer medicamento desde la pestaña Medicamentos.'}
              </Text>
            </>
          )}
        </View>

        {groups.previousUnresolved.length ? (
          <View style={styles.previousAlert}>
            <Text style={styles.previousAlertTitle}>
              {groups.previousUnresolved.length === 1
                ? 'Tienes 1 toma anterior sin resolver'
                : `Tienes ${groups.previousUnresolved.length} tomas anteriores sin resolver`}
            </Text>
            <Text style={styles.previousAlertCopy}>Se mantienen con su fecha y hora originales hasta que las marques como tomadas u omitidas.</Text>
          </View>
        ) : null}

        {groups.overdueToday.length ? (
          <>
            <Text style={[styles.section, styles.sectionOverdue]}>ATRASADAS</Text>
            {groups.overdueToday.map((item) => renderDoseCard(item))}
          </>
        ) : null}

        {groups.upcoming.length ? (
          <>
            <Text style={styles.section}>PRÓXIMAS</Text>
            {groups.upcoming.map((item) => renderDoseCard(item, true))}
          </>
        ) : null}

        {groups.resolved.length ? (
          <>
            <Text style={styles.section}>RESUELTAS HOY</Text>
            {groups.resolved.map((item) => renderDoseCard(item, true))}
          </>
        ) : null}

        {!doses.length ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Todavía no hay nada aquí</Text>
            <Text style={styles.emptyCopy}>Configura un medicamento y sus horarios para comenzar.</Text>
          </View>
        ) : null}

        <View style={styles.safety}>
          <Text style={styles.safetyTitle}>Importante</Text>
          <Text style={styles.safetyCopy}>“Atrasada” significa que pasó la hora que configuraste. WeekFlow Pills no indica si corresponde tomar esa dosis después.</Text>
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
  versionText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  hero: { marginTop: 28, marginBottom: 16 },
  eyebrow: { color: '#76AFFF', fontSize: 13, fontWeight: '900', letterSpacing: 4 },
  title: { color: colors.text, fontSize: 29, lineHeight: 35, fontWeight: '900', marginTop: 7 },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 6 },
  nowCard: { backgroundColor: '#102A4D', borderRadius: 26, borderWidth: 1, borderColor: '#2A5D99', padding: 20 },
  nowCardOverdue: { backgroundColor: '#321B24', borderColor: '#7B3B49' },
  nowLabel: { color: '#76AFFF', fontSize: 12, fontWeight: '900', letterSpacing: 2.5 },
  nowLabelOverdue: { color: '#FF9AA4' },
  nowStatus: { color: '#B8C9E0', fontSize: 13, fontWeight: '900', marginTop: 12, textTransform: 'uppercase' },
  nowTime: { color: colors.text, fontSize: 42, lineHeight: 49, fontWeight: '900', marginTop: 3 },
  nowName: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 2 },
  nowDose: { color: '#A9CFFF', fontSize: 15, fontWeight: '800', marginTop: 4 },
  nowPrevious: { color: '#FFB7BE', fontSize: 12, fontWeight: '800', marginTop: 8 },
  lastTaken: { color: '#7DE1C1', fontSize: 12, fontWeight: '800', marginTop: 10 },
  nowInstructions: { color: '#C2D0E3', fontSize: 13, lineHeight: 19, marginTop: 10 },
  doneTitle: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 14 },
  doneCopy: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  previousAlert: { marginTop: 14, borderRadius: 18, backgroundColor: '#251B31', borderWidth: 1, borderColor: '#513463', padding: 15 },
  previousAlertTitle: { color: '#E7C8FF', fontSize: 14, fontWeight: '900' },
  previousAlertCopy: { color: '#B7A6C8', fontSize: 12, lineHeight: 18, marginTop: 5 },
  section: { color: '#76AFFF', fontSize: 13, fontWeight: '900', letterSpacing: 3, marginTop: 28, marginBottom: 11 },
  sectionOverdue: { color: '#FF9AA4' },
  doseCard: { backgroundColor: colors.surface, borderRadius: 23, borderWidth: 1, borderColor: colors.line, padding: 17, marginBottom: 11 },
  doseCardOverdue: { backgroundColor: '#21131A', borderColor: '#60313D' },
  doseCardResolved: { opacity: 0.76 },
  doseHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  time: { color: '#76AFFF', fontSize: 19, fontWeight: '900' },
  dateTag: { color: colors.muted, fontSize: 11, fontWeight: '800', marginTop: 2 },
  statusPill: { flexShrink: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surface2 },
  statusOverdue: { backgroundColor: '#4A202A' },
  statusTaken: { backgroundColor: '#103B35' },
  statusSkipped: { backgroundColor: '#3B2027' },
  statusText: { color: colors.muted, fontSize: 11, fontWeight: '900', textAlign: 'right' },
  statusOverdueText: { color: '#FF9AA4' },
  statusTakenText: { color: '#7DE1C1' },
  statusSkippedText: { color: '#FF9AA4' },
  medName: { color: colors.text, fontSize: 19, fontWeight: '900', marginTop: 13 },
  medDose: { color: '#B8C9E0', fontSize: 14, fontWeight: '800', marginTop: 3 },
  lastDoseLine: { color: '#8DB7EF', fontSize: 11, fontWeight: '800', marginTop: 8 },
  instructions: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 8 },
  lowStock: { color: colors.warning, fontSize: 12, fontWeight: '900', marginTop: 10 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 16 },
  action: { flex: 1, minHeight: 50, borderRadius: 15, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  takenButton: { backgroundColor: colors.blue, borderColor: colors.blue },
  takenButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  skipButtonText: { color: colors.muted, fontSize: 14, fontWeight: '900' },
  emptyCard: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.line, padding: 20, marginTop: 20 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  emptyCopy: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  safety: { marginTop: 24, borderRadius: 18, backgroundColor: '#111C30', padding: 15 },
  safetyTitle: { color: '#C5D5E9', fontSize: 12, fontWeight: '900' },
  safetyCopy: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 4 },
});
