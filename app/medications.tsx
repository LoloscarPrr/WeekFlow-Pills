import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Medication } from '@/src/domain/medication';
import { formatDays, normalizeTimes, weekdayOptions } from '@/src/domain/medication';
import { addMedication, listMedications, setMedicationActive, setMedicationStock } from '@/src/data/medications';
import { syncMedicationNotifications } from '@/src/services/notifications';
import { colors } from '@/src/theme/colors';

const allDays = [0, 1, 2, 3, 4, 5, 6];

export default function MedicationsScreen() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [instructions, setInstructions] = useState('');
  const [times, setTimes] = useState('09:00');
  const [days, setDays] = useState<number[]>(allDays);
  const [stock, setStock] = useState('');
  const [message, setMessage] = useState('');

  const refresh = () => setMedications(listMedications());

  useEffect(() => {
    refresh();
  }, []);

  const toggleDay = (day: number) => {
    setDays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day],
    );
  };

  const save = async () => {
    try {
      setMessage('');
      if (!name.trim()) throw new Error('Escribe el nombre del medicamento.');
      if (!dose.trim()) throw new Error('Escribe la dosis indicada.');
      if (!days.length) throw new Error('Selecciona al menos un día.');

      const parsedTimes = normalizeTimes(times);
      if (!parsedTimes.length) throw new Error('Agrega al menos una hora.');

      const parsedStock = stock.trim() === '' ? null : Number(stock);
      if (parsedStock !== null && (!Number.isInteger(parsedStock) || parsedStock < 0)) {
        throw new Error('El stock debe ser un número entero igual o mayor que 0.');
      }

      addMedication({
        name: name.trim(),
        dose: dose.trim(),
        instructions: instructions.trim(),
        times: parsedTimes,
        days: [...days].sort((a, b) => a - b),
        stock: parsedStock,
        lowStockThreshold: 5,
      });

      const notificationsEnabled = await syncMedicationNotifications();
      setName('');
      setDose('');
      setInstructions('');
      setTimes('09:00');
      setDays(allDays);
      setStock('');
      refresh();
      setMessage(notificationsEnabled ? 'Medicamento guardado y recordatorios actualizados.' : 'Medicamento guardado. Activa las notificaciones para recibir recordatorios.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar.');
    }
  };

  const toggleActive = async (medication: Medication) => {
    setMedicationActive(medication.id, !medication.active);
    refresh();
    await syncMedicationNotifications().catch(() => undefined);
  };

  const adjustStock = (medication: Medication, delta: number) => {
    if (medication.stock === null) return;
    setMedicationStock(medication.id, Math.max(0, medication.stock + delta));
    refresh();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>MEDICAMENTOS</Text>
          <Text style={styles.title}>Configurar tratamiento</Text>
          <Text style={styles.subtitle}>Copia aquí exactamente la indicación prescrita.</Text>

          <View style={styles.form}>
            <Field label="Medicamento">
              <TextInput value={name} onChangeText={setName} placeholder="Ej. Losartán" placeholderTextColor="#657793" style={styles.input} />
            </Field>
            <Field label="Dosis indicada">
              <TextInput value={dose} onChangeText={setDose} placeholder="Ej. 1 comprimido · 50 mg" placeholderTextColor="#657793" style={styles.input} />
            </Field>
            <Field label="Horarios">
              <TextInput value={times} onChangeText={setTimes} placeholder="09:00, 21:00" placeholderTextColor="#657793" style={styles.input} autoCapitalize="none" />
              <Text style={styles.help}>Separa varios horarios con coma.</Text>
            </Field>
            <Field label="Días">
              <View style={styles.days}>
                {weekdayOptions.map((item) => {
                  const active = days.includes(item.value);
                  return (
                    <Pressable key={item.value} onPress={() => toggleDay(item.value)} style={[styles.day, active && styles.dayActive]}>
                      <Text style={[styles.dayText, active && styles.dayTextActive]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>
            <Field label="Indicaciones (opcional)">
              <TextInput value={instructions} onChangeText={setInstructions} placeholder="Ej. Con comida" placeholderTextColor="#657793" style={styles.input} />
            </Field>
            <Field label="Stock actual (opcional)">
              <TextInput value={stock} onChangeText={setStock} placeholder="Ej. 30" placeholderTextColor="#657793" keyboardType="number-pad" style={styles.input} />
              <Text style={styles.help}>La app avisa cuando quedan 5 unidades o menos.</Text>
            </Field>

            {message ? <Text style={styles.message}>{message}</Text> : null}
            <Pressable style={styles.save} onPress={save}>
              <Text style={styles.saveText}>Guardar medicamento</Text>
            </Pressable>
          </View>

          <Text style={styles.section}>CONFIGURADOS</Text>
          {medications.length ? medications.map((medication) => (
            <View key={medication.id} style={[styles.medCard, !medication.active && styles.medCardPaused]}>
              <View style={styles.medTop}>
                <View style={styles.medMain}>
                  <Text style={styles.medName}>{medication.name}</Text>
                  <Text style={styles.medDose}>{medication.dose}</Text>
                </View>
                <View style={[styles.state, medication.active ? styles.stateActive : styles.statePaused]}>
                  <Text style={[styles.stateText, medication.active ? styles.stateActiveText : styles.statePausedText]}>{medication.active ? 'Activo' : 'Pausado'}</Text>
                </View>
              </View>
              <Text style={styles.medMeta}>{medication.times.join(' · ')} · {formatDays(medication.days)}</Text>
              {medication.instructions ? <Text style={styles.medInstructions}>{medication.instructions}</Text> : null}

              {medication.stock !== null ? (
                <View style={styles.stockRow}>
                  <View>
                    <Text style={styles.stockLabel}>Stock</Text>
                    <Text style={[styles.stockValue, medication.stock <= medication.lowStockThreshold && styles.stockLow]}>{medication.stock} unidades</Text>
                  </View>
                  <View style={styles.stockActions}>
                    <Pressable style={styles.stockButton} onPress={() => adjustStock(medication, -1)}><Text style={styles.stockButtonText}>−</Text></Pressable>
                    <Pressable style={styles.stockButton} onPress={() => adjustStock(medication, 1)}><Text style={styles.stockButtonText}>+</Text></Pressable>
                  </View>
                </View>
              ) : null}

              <Pressable style={styles.pauseButton} onPress={() => toggleActive(medication)}>
                <Text style={styles.pauseText}>{medication.active ? 'Pausar recordatorios' : 'Reanudar recordatorios'}</Text>
              </Pressable>
            </View>
          )) : <Text style={styles.empty}>Aún no hay medicamentos configurados.</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { padding: 22, paddingBottom: 28 },
  eyebrow: { color: '#76AFFF', fontSize: 13, fontWeight: '900', letterSpacing: 3.5 },
  title: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: '900', marginTop: 7 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  form: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 24, padding: 17, marginTop: 20 },
  field: { marginBottom: 16 },
  label: { color: '#C9D6E8', fontSize: 12, fontWeight: '900', marginBottom: 7 },
  input: { minHeight: 50, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, color: colors.text, fontSize: 16 },
  help: { color: colors.muted, fontSize: 11, marginTop: 6 },
  days: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  dayActive: { backgroundColor: '#12315A', borderColor: colors.blue },
  dayText: { color: colors.muted, fontSize: 13, fontWeight: '900' },
  dayTextActive: { color: colors.text },
  message: { color: '#B6CBE7', fontSize: 12, lineHeight: 18, marginBottom: 12 },
  save: { minHeight: 52, backgroundColor: colors.blue, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  section: { color: '#76AFFF', fontSize: 13, fontWeight: '900', letterSpacing: 3, marginTop: 30, marginBottom: 11 },
  medCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 22, padding: 17, marginBottom: 11 },
  medCardPaused: { opacity: 0.68 },
  medTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  medMain: { flex: 1 },
  medName: { color: colors.text, fontSize: 18, fontWeight: '900' },
  medDose: { color: '#B7C8DF', fontSize: 13, fontWeight: '800', marginTop: 4 },
  state: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  stateActive: { backgroundColor: '#103B35' },
  statePaused: { backgroundColor: '#332D22' },
  stateText: { fontSize: 10, fontWeight: '900' },
  stateActiveText: { color: '#7DE1C1' },
  statePausedText: { color: '#E7C77C' },
  medMeta: { color: '#76AFFF', fontSize: 12, fontWeight: '800', marginTop: 12 },
  medInstructions: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 7 },
  stockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 13, borderTopWidth: 1, borderTopColor: colors.line },
  stockLabel: { color: colors.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  stockValue: { color: colors.text, fontSize: 14, fontWeight: '900', marginTop: 3 },
  stockLow: { color: colors.warning },
  stockActions: { flexDirection: 'row', gap: 7 },
  stockButton: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  stockButtonText: { color: colors.text, fontSize: 23, lineHeight: 26, fontWeight: '800' },
  pauseButton: { minHeight: 44, borderRadius: 13, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginTop: 13 },
  pauseText: { color: '#A9CFFF', fontSize: 12, fontWeight: '900' },
  empty: { color: colors.muted, fontSize: 13, lineHeight: 19 },
});
