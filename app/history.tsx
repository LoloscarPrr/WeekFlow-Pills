import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { HistoryEntry } from '@/src/domain/medication';
import { listHistory } from '@/src/data/medications';
import { colors } from '@/src/theme/colors';

export default function HistoryScreen() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setHistory(listHistory());
  }, []);

  const totals = useMemo(() => ({
    taken: history.filter((item) => item.status === 'taken').length,
    skipped: history.filter((item) => item.status === 'skipped').length,
  }), [history]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>HISTORIAL</Text>
        <Text style={styles.title}>Registro de tomas</Text>
        <Text style={styles.subtitle}>Un registro simple de lo que se marcó en la app.</Text>

        <View style={styles.summary}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{totals.taken}</Text>
            <Text style={styles.statLabel}>Tomados</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{totals.skipped}</Text>
            <Text style={styles.statLabel}>Omitidos</Text>
          </View>
        </View>

        <Text style={styles.section}>REGISTROS RECIENTES</Text>
        {history.length ? history.map((item) => (
          <View key={item.id} style={styles.row}>
            <View style={styles.dateBlock}>
              <Text style={styles.time}>{item.scheduledTime}</Text>
              <Text style={styles.date}>{item.scheduledDate}</Text>
            </View>
            <View style={styles.main}>
              <Text style={styles.name}>{item.medicationName}</Text>
              <Text style={styles.dose}>{item.dose}</Text>
            </View>
            <Text style={[styles.status, item.status === 'taken' ? styles.taken : styles.skipped]}>
              {item.status === 'taken' ? 'Tomado' : 'Omitido'}
            </Text>
          </View>
        )) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Sin registros todavía</Text>
            <Text style={styles.emptyCopy}>Cuando marques una toma como Tomado u Omitido aparecerá aquí.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
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
  section: { color: '#76AFFF', fontSize: 13, fontWeight: '900', letterSpacing: 3, marginTop: 30, marginBottom: 11 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 19, padding: 14, marginBottom: 9 },
  dateBlock: { width: 72 },
  time: { color: '#76AFFF', fontSize: 16, fontWeight: '900' },
  date: { color: colors.muted, fontSize: 10, marginTop: 3 },
  main: { flex: 1 },
  name: { color: colors.text, fontSize: 15, fontWeight: '900' },
  dose: { color: colors.muted, fontSize: 11, marginTop: 3 },
  status: { fontSize: 11, fontWeight: '900' },
  taken: { color: '#7DE1C1' },
  skipped: { color: '#FF9AA4' },
  empty: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 18 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  emptyCopy: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
});
