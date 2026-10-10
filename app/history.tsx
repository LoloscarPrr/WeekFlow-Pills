import { useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { HistoryEntry, IntakeStatus } from '@/src/domain/medication';
import { correctHistoryEntry, listHistory } from '@/src/data/medications';
import { colors } from '@/src/theme/colors';

type Filter = 'all' | IntakeStatus;

function formatRecordedTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

function prettyDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('es-CL', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
}

export default function HistoryScreen() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const refresh = () => setHistory(listHistory(500));

  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es-CL');
    return history.filter((item) => {
      if (filter !== 'all' && item.status !== filter) return false;
      if (!normalized) return true;
      return item.medicationName.toLocaleLowerCase('es-CL').includes(normalized);
    });
  }, [history, filter, query]);

  const groups = useMemo(() => {
    const map = new Map<string, HistoryEntry[]>();
    for (const item of filtered) {
      const current = map.get(item.scheduledDate) ?? [];
      current.push(item);
      map.set(item.scheduledDate, current);
    }
    return [...map.entries()];
  }, [filtered]);

  const totals = useMemo(() => ({
    taken: history.filter((item) => item.status === 'taken').length,
    skipped: history.filter((item) => item.status === 'skipped').length,
  }), [history]);

  const correct = (entry: HistoryEntry, status: IntakeStatus) => {
    if (entry.status === status) return;

    Alert.alert(
      'Corregir registro',
      `Vas a cambiar esta toma de ${entry.status === 'taken' ? 'Tomada' : 'Omitida'} a ${status === 'taken' ? 'Tomada' : 'Omitida'}. El stock se ajustará automáticamente si corresponde.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, corregir',
          onPress: () => {
            correctHistoryEntry(entry, status);
            refresh();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>HISTORIAL</Text>
        <Text style={styles.title}>Registro de tomas</Text>
        <Text style={styles.subtitle}>Qué estaba programado, cuándo se registró y qué estado quedó guardado.</Text>

        <View style={styles.summary}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{totals.taken}</Text>
            <Text style={styles.statLabel}>Tomadas</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{totals.skipped}</Text>
            <Text style={styles.statLabel}>Omitidas</Text>
          </View>
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar medicamento"
          placeholderTextColor="#657793"
          style={styles.search}
        />

        <View style={styles.filters}>
          <FilterButton label="Todos" active={filter === 'all'} onPress={() => setFilter('all')} />
          <FilterButton label="Tomadas" active={filter === 'taken'} onPress={() => setFilter('taken')} />
          <FilterButton label="Omitidas" active={filter === 'skipped'} onPress={() => setFilter('skipped')} />
        </View>

        <Text style={styles.section}>REGISTROS</Text>
        {groups.length ? groups.map(([date, entries]) => (
          <View key={date} style={styles.group}>
            <Text style={styles.groupDate}>{prettyDate(date)}</Text>
            {entries.map((item) => (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.timeBlock}>
                    <Text style={styles.time}>{item.scheduledTime}</Text>
                    <Text style={styles.scheduledLabel}>programada</Text>
                  </View>
                  <Text style={[styles.status, item.status === 'taken' ? styles.taken : styles.skipped]}>
                    {item.status === 'taken' ? 'Tomada' : 'Omitida'}
                  </Text>
                </View>

                <Text style={styles.name}>{item.medicationName}</Text>
                <Text style={styles.dose}>{item.dose}</Text>
                {item.instructions ? <Text style={styles.instructions}>{item.instructions}</Text> : null}

                <View style={styles.metaBox}>
                  <Text style={styles.metaLabel}>Hora programada</Text>
                  <Text style={styles.metaValue}>{item.scheduledTime}</Text>
                  <Text style={styles.metaLabel}>Registrada</Text>
                  <Text style={styles.metaValue}>{formatRecordedTime(item.recordedAt)}</Text>
                </View>

                <View style={styles.actions}>
                  <Pressable
                    style={[styles.action, item.status === 'taken' && styles.actionActiveTaken]}
                    onPress={() => correct(item, 'taken')}
                  >
                    <Text style={styles.actionText}>✓ Tomada</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.action, item.status === 'skipped' && styles.actionActiveSkipped]}
                    onPress={() => correct(item, 'skipped')}
                  >
                    <Text style={styles.actionText}>Omitida</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Sin registros para mostrar</Text>
            <Text style={styles.emptyCopy}>Prueba otro filtro o registra una toma desde Hoy.</Text>
          </View>
        )}

        <View style={styles.note}>
          <Text style={styles.noteTitle}>Historial preservado</Text>
          <Text style={styles.noteCopy}>Editar o archivar un medicamento no cambia el nombre ni la dosis guardados en registros nuevos. Las correcciones del historial son explícitas.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FilterButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.filter, active && styles.filterActive]} onPress={onPress}>
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 22, paddingBottom: 28 },
  eyebrow: { color: '#76AFFF', fontSize: 13, fontWeight: '900', letterSpacing: 3.5 },
  title: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: '900', marginTop: 7 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  summary: { flexDirection: 'row', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 22, marginTop: 20, paddingVertical: 17 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: colors.text, fontSize: 24, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', marginTop: 4 },
  divider: { width: 1, backgroundColor: colors.line },
  search: { minHeight: 50, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 15, paddingHorizontal: 14, color: colors.text, fontSize: 15, marginTop: 16 },
  filters: { flexDirection: 'row', gap: 8, marginTop: 10 },
  filter: { flex: 1, minHeight: 42, borderRadius: 13, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  filterActive: { backgroundColor: '#12315A', borderColor: colors.blue },
  filterText: { color: colors.muted, fontSize: 11, fontWeight: '900' },
  filterTextActive: { color: colors.text },
  section: { color: '#76AFFF', fontSize: 13, fontWeight: '900', letterSpacing: 3, marginTop: 28, marginBottom: 12 },
  group: { marginBottom: 6 },
  groupDate: { color: '#C6D6E8', fontSize: 13, fontWeight: '900', textTransform: 'capitalize', marginBottom: 9 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 15, marginBottom: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  timeBlock: { flexDirection: 'column' },
  time: { color: '#76AFFF', fontSize: 19, fontWeight: '900' },
  scheduledLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', marginTop: 1 },
  status: { fontSize: 11, fontWeight: '900', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  taken: { color: '#7DE1C1', backgroundColor: '#103B35' },
  skipped: { color: '#FF9AA4', backgroundColor: '#3B2027' },
  name: { color: colors.text, fontSize: 17, fontWeight: '900', marginTop: 12 },
  dose: { color: '#B8C9E0', fontSize: 13, fontWeight: '800', marginTop: 3 },
  instructions: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 6 },
  metaBox: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  metaLabel: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  metaValue: { color: colors.text, fontSize: 10, fontWeight: '900', marginRight: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 13 },
  action: { flex: 1, minHeight: 42, borderRadius: 13, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  actionActiveTaken: { backgroundColor: '#103B35', borderColor: '#2F7567' },
  actionActiveSkipped: { backgroundColor: '#3B2027', borderColor: '#6E3742' },
  actionText: { color: '#DDE7F4', fontSize: 11, fontWeight: '900' },
  empty: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 18 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  emptyCopy: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  note: { marginTop: 22, backgroundColor: '#111C30', borderRadius: 18, padding: 15 },
  noteTitle: { color: '#C5D5E9', fontSize: 12, fontWeight: '900' },
  noteCopy: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 4 },
});
