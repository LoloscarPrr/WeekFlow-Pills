import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Medication, ScheduleMode } from '@/src/domain/medication';
import {
  formatDays,
  generateTimesFromInterval,
  localDateKey,
  normalizeDateKey,
  normalizeTime,
  normalizeTimes,
  resolveMedicationTimes,
  upcomingMedicationOccurrences,
  validateMedicationDateRange,
  weekdayOptions,
} from '@/src/domain/medication';
import {
  addMedication,
  addMedicationStock,
  listArchivedMedications,
  listLastTakenByMedication,
  listMedications,
  listStockMovements,
  setMedicationActive,
  setMedicationArchived,
  setMedicationLowStockThreshold,
  setMedicationStock,
  updateMedication,
  type LastTaken,
  type StockMovement,
} from '@/src/data/medications';
import { syncMedicationNotifications } from '@/src/services/notifications';
import { colors } from '@/src/theme/colors';

const allDays = [0, 1, 2, 3, 4, 5, 6];

function lastTakenText(last?: LastTaken) {
  if (!last) return 'Sin tomas registradas';
  const time = new Date(last.recordedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  return `Última toma: ${last.scheduledDate} · ${time}`;
}

function prettyDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
}

export default function MedicationsScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [archivedMedications, setArchivedMedications] = useState<Medication[]>([]);
  const [lastTaken, setLastTaken] = useState<Record<number, LastTaken>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [instructions, setInstructions] = useState('');
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('fixed');
  const [fixedTimes, setFixedTimes] = useState<string[]>(['09:00']);
  const [intervalHours, setIntervalHours] = useState('6');
  const [startTime, setStartTime] = useState('09:00');
  const [days, setDays] = useState<number[]>(allDays);
  const [startDate, setStartDate] = useState(localDateKey());
  const [endDate, setEndDate] = useState('');
  const [stock, setStock] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('5');
  const [expandedStockId, setExpandedStockId] = useState<number | null>(null);
  const [stockMovements, setStockMovements] = useState<Record<number, StockMovement[]>>({});
  const [message, setMessage] = useState('');

  const refresh = () => {
    setMedications(listMedications());
    setArchivedMedications(listArchivedMedications());
    setLastTaken(listLastTakenByMedication());
  };

  useEffect(refresh, []);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setDose('');
    setInstructions('');
    setScheduleMode('fixed');
    setFixedTimes(['09:00']);
    setIntervalHours('6');
    setStartTime('09:00');
    setDays(allDays);
    setStartDate(localDateKey());
    setEndDate('');
    setStock('');
    setLowStockThreshold('5');
  };

  const beginEdit = (medication: Medication) => {
    setEditingId(medication.id);
    setName(medication.name);
    setDose(medication.dose);
    setInstructions(medication.instructions);
    setScheduleMode(medication.scheduleMode);
    setFixedTimes(medication.times.length ? medication.times : ['09:00']);
    setIntervalHours(String(medication.intervalHours ?? 6));
    setStartTime(medication.startTime ?? medication.times[0] ?? '09:00');
    setDays(medication.days);
    setStartDate(medication.startDate);
    setEndDate(medication.endDate ?? '');
    setStock(medication.stock === null ? '' : String(medication.stock));
    setLowStockThreshold(String(medication.lowStockThreshold));
    setMessage('Editando medicamento. Solo se recalcularán las tomas futuras.');
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const toggleDay = (day: number) =>
    setDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day]);

  const updateFixedTime = (index: number, value: string) =>
    setFixedTimes((current) => current.map((time, i) => i === index ? value : time));

  const addFixedTime = () => setFixedTimes((current) => [...current, '09:00']);
  const removeFixedTime = (index: number) =>
    setFixedTimes((current) => current.length <= 1 ? current : current.filter((_, i) => i !== index));

  const preview = useMemo(() => {
    try {
      const range = validateMedicationDateRange(startDate, endDate.trim() ? endDate : null);
      const times = scheduleMode === 'fixed'
        ? normalizeTimes(fixedTimes)
        : generateTimesFromInterval(startTime, Number(intervalHours));
      if (!times.length || !days.length) return { lines: [], error: '' };

      const fake: Medication = {
        id: editingId ?? -1,
        name: name || 'Medicamento',
        dose,
        instructions,
        times: scheduleMode === 'fixed' ? times : [],
        days,
        scheduleMode,
        intervalHours: scheduleMode === 'interval' ? Number(intervalHours) : null,
        startTime: scheduleMode === 'interval' ? normalizeTime(startTime) : null,
        startDate: range.startDate,
        endDate: range.endDate,
        stock: null,
        lowStockThreshold: 5,
        active: true,
        archived: false,
      };
      const from = new Date();
      if (range.startDate > localDateKey(from)) {
        const [y, m, d] = range.startDate.split('-').map(Number);
        from.setFullYear(y, m - 1, d);
        from.setHours(0, 0, 0, 0);
      }
      const next = upcomingMedicationOccurrences(fake, from, 6);
      return {
        lines: next.map((item) => `${prettyDate(item.date)} · ${item.time}`),
        error: '',
      };
    } catch (error) {
      return { lines: [], error: error instanceof Error ? error.message : 'Programación inválida.' };
    }
  }, [scheduleMode, fixedTimes, intervalHours, startTime, days, startDate, endDate, editingId, name, dose, instructions]);

  const save = async () => {
    try {
      setMessage('');
      if (!name.trim()) throw new Error('Escribe el nombre del medicamento.');
      if (!dose.trim()) throw new Error('Escribe la dosis indicada.');
      if (!days.length) throw new Error('Selecciona al menos un día.');

      const range = validateMedicationDateRange(startDate, endDate.trim() ? endDate : null);

      let parsedTimes: string[] = [];
      let parsedInterval: number | null = null;
      let parsedStart: string | null = null;

      if (scheduleMode === 'fixed') {
        parsedTimes = normalizeTimes(fixedTimes);
        if (!parsedTimes.length) throw new Error('Agrega al menos una hora específica.');
        if (parsedTimes.length !== fixedTimes.length) {
          throw new Error('Hay horarios repetidos. Cada hora debe aparecer una sola vez.');
        }
      } else {
        parsedInterval = Number(intervalHours);
        generateTimesFromInterval(startTime, parsedInterval);
        parsedStart = normalizeTime(startTime);
      }

      const parsedStock = stock.trim() === '' ? null : Number(stock);
      if (parsedStock !== null && (!Number.isInteger(parsedStock) || parsedStock < 0)) {
        throw new Error('El stock debe ser un entero igual o mayor que 0.');
      }
      const parsedThreshold = Number(lowStockThreshold);
      if (!Number.isInteger(parsedThreshold) || parsedThreshold < 0) {
        throw new Error('El aviso de stock bajo debe ser un entero igual o mayor que 0.');
      }

      const common = {
        name: name.trim(),
        dose: dose.trim(),
        instructions: instructions.trim(),
        scheduleMode,
        times: parsedTimes,
        intervalHours: parsedInterval,
        startTime: parsedStart,
        startDate: range.startDate,
        endDate: range.endDate,
        days: [...days].sort((a, b) => a - b),
        stock: parsedStock,
        lowStockThreshold: parsedThreshold,
      };

      if (editingId !== null) {
        const current = medications.find((item) => item.id === editingId);
        if (!current) throw new Error('No se encontró el medicamento que estabas editando.');
        updateMedication({ ...current, ...common });
      } else {
        addMedication(common);
      }

      const wasEditing = editingId !== null;
      const notificationsEnabled = await syncMedicationNotifications();
      resetForm();
      refresh();
      setMessage(
        notificationsEnabled
          ? (wasEditing ? 'Cambios guardados. Las próximas tomas y recordatorios fueron recalculados.' : 'Medicamento guardado y recordatorios programados.')
          : 'Cambios guardados. Activa las notificaciones para recibir recordatorios.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar.');
    }
  };

  const toggleActive = async (medication: Medication) => {
    setMedicationActive(medication.id, !medication.active);
    refresh();
    await syncMedicationNotifications().catch(() => undefined);
    setMessage(medication.active
      ? `${medication.name} quedó pausado. Sus recordatorios futuros fueron cancelados.`
      : `${medication.name} volvió a estar activo y sus recordatorios fueron restaurados.`);
  };

  const archiveMedication = (medication: Medication) => {
    Alert.alert(
      'Archivar medicamento',
      `${medication.name} dejará de aparecer entre los tratamientos activos y no generará nuevos recordatorios. Su historial se conservará.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Archivar',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setMedicationArchived(medication.id, true);
              refresh();
              await syncMedicationNotifications().catch(() => undefined);
              setMessage(`${medication.name} fue archivado. El historial sigue guardado.`);
            })();
          },
        },
      ],
    );
  };

  const restoreMedication = async (medication: Medication) => {
    setMedicationArchived(medication.id, false);
    refresh();
    await syncMedicationNotifications().catch(() => undefined);
    setMessage(`${medication.name} fue restaurado y quedó activo nuevamente.`);
  };

  const refreshMovements = (medicationId: number) => {
    setStockMovements((current) => ({ ...current, [medicationId]: listStockMovements(medicationId) }));
  };

  const toggleMovements = (medicationId: number) => {
    setExpandedStockId((current) => current === medicationId ? null : medicationId);
    refreshMovements(medicationId);
  };

  const adjustStock = (medication: Medication, delta: number) => {
    if (medication.stock === null) return;
    const next = Math.max(0, medication.stock + delta);
    setMedicationStock(medication.id, next, 'correction', delta > 0 ? 'Corrección manual +' : 'Corrección manual −');
    refresh();
    refreshMovements(medication.id);
  };

  const refillStock = (medication: Medication, amount = 10) => {
    if (medication.stock === null) return;
    addMedicationStock(medication.id, amount, 'Reposición manual');
    refresh();
    refreshMovements(medication.id);
  };

  const adjustThreshold = (medication: Medication, delta: number) => {
    const next = Math.max(0, medication.lowStockThreshold + delta);
    setMedicationLowStockThreshold(medication.id, next);
    refresh();
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollRef} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.eyebrow}>WEEKFLOW PILLS</Text>
          <Text style={s.title}>{editingId !== null ? 'Editar medicamento' : 'Configurar tratamiento'}</Text>
          <Text style={s.subtitle}>La dosis, el horario y la duración se configuran por separado. La app no interpreta instrucciones médicas desde texto libre.</Text>

          <View style={[s.card, editingId !== null && s.editing]}>
            {editingId !== null ? (
              <View style={s.banner}>
                <Text style={s.bannerText}>MODO EDICIÓN</Text>
                <Pressable onPress={() => { resetForm(); setMessage('Edición cancelada.'); }}>
                  <Text style={s.cancel}>Cancelar</Text>
                </Pressable>
              </View>
            ) : null}

            <Field label="Medicamento"><Input value={name} onChangeText={setName} placeholder="Ej. Losartán" /></Field>
            <Field label="Dosis indicada"><Input value={dose} onChangeText={setDose} placeholder="Ej. 1 comprimido · 50 mg" /></Field>

            <Field label="Programación">
              <View style={s.row}>
                <ModeButton active={scheduleMode === 'fixed'} label="Horas específicas" onPress={() => setScheduleMode('fixed')} />
                <ModeButton active={scheduleMode === 'interval'} label="Cada X horas" onPress={() => setScheduleMode('interval')} />
              </View>
            </Field>

            {scheduleMode === 'fixed' ? (
              <Field label="Horas específicas">
                {fixedTimes.map((time, index) => (
                  <View key={index} style={s.timeRow}>
                    <View style={s.flex}><Input value={time} onChangeText={(value) => updateFixedTime(index, value)} placeholder="09:00" /></View>
                    <Pressable style={s.removeTime} onPress={() => removeFixedTime(index)}>
                      <Text style={s.removeTimeText}>×</Text>
                    </Pressable>
                  </View>
                ))}
                <Pressable style={s.addTime} onPress={addFixedTime}><Text style={s.addTimeText}>+ Agregar otra hora</Text></Pressable>
              </Field>
            ) : (
              <Field label="Intervalo">
                <View style={s.row}>
                  <View style={s.half}><Text style={s.mini}>Cada X horas</Text><Input value={intervalHours} onChangeText={setIntervalHours} placeholder="6" keyboardType="number-pad" /></View>
                  <View style={s.half}><Text style={s.mini}>Primera toma</Text><Input value={startTime} onChangeText={setStartTime} placeholder="09:00" /></View>
                </View>
                <Text style={s.help}>Los intervalos pueden cruzar medianoche. La vista previa muestra las próximas tomas reales.</Text>
              </Field>
            )}

            <Field label="Días">
              <View style={s.days}>
                {weekdayOptions.map((item) => (
                  <Pressable key={item.value} onPress={() => toggleDay(item.value)} style={[s.day, days.includes(item.value) && s.dayOn]}>
                    <Text style={[s.dayText, days.includes(item.value) && s.dayTextOn]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
            </Field>

            <Field label="Duración">
              <View style={s.row}>
                <View style={s.half}><Text style={s.mini}>Comienza</Text><Input value={startDate} onChangeText={setStartDate} placeholder="AAAA-MM-DD" /></View>
                <View style={s.half}><Text style={s.mini}>Termina (opcional)</Text><Input value={endDate} onChangeText={setEndDate} placeholder="AAAA-MM-DD" /></View>
              </View>
            </Field>

            <View style={s.preview}>
              <Text style={s.previewLabel}>PRÓXIMAS TOMAS</Text>
              {preview.error ? <Text style={s.error}>{preview.error}</Text> : (
                preview.lines.length
                  ? preview.lines.map((line) => <Text key={line} style={s.previewText}>{line}</Text>)
                  : <Text style={s.help}>No hay próximas tomas con esta configuración.</Text>
              )}
            </View>

            <Field label="Indicaciones (opcional)"><Input value={instructions} onChangeText={setInstructions} placeholder="Ej. Con comida" /></Field>
            <Field label="Stock actual (opcional)"><Input value={stock} onChangeText={setStock} placeholder="Ej. 30" keyboardType="number-pad" /><Text style={s.help}>Déjalo vacío si no quieres controlar stock.</Text></Field>
            {stock.trim() !== '' ? (
              <Field label="Avisar cuando queden">
                <Input value={lowStockThreshold} onChangeText={setLowStockThreshold} placeholder="5" keyboardType="number-pad" />
              </Field>
            ) : null}

            {!!message && <Text style={s.message}>{message}</Text>}
            <Pressable style={s.save} onPress={save}>
              <Text style={s.saveText}>{editingId !== null ? 'Guardar cambios' : 'Guardar medicamento'}</Text>
            </Pressable>
          </View>

          <Text style={s.section}>CONFIGURADOS</Text>
          {medications.length ? medications.map((medication) => {
            const effective = resolveMedicationTimes(medication);
            const mode = medication.scheduleMode === 'interval'
              ? `Cada ${medication.intervalHours} h · desde ${medication.startTime}`
              : 'Horas específicas';
            const duration = medication.endDate
              ? `${medication.startDate} → ${medication.endDate}`
              : `Desde ${medication.startDate}`;

            return (
              <View key={medication.id} style={[s.med, !medication.active && s.paused]}>
                <View style={s.medTop}>
                  <View style={s.flex}>
                    <Text style={s.medName}>{medication.name}</Text>
                    <Text style={s.medDose}>{medication.dose}</Text>
                  </View>
                  <Text style={medication.active ? s.active : s.inactive}>{medication.active ? 'Activo' : 'Pausado'}</Text>
                </View>
                <Text style={s.medMode}>{mode}</Text>
                <Text style={s.medMeta}>{effective.join(' · ')} · {formatDays(medication.days)}</Text>
                <Text style={s.duration}>{duration}</Text>
                <Text style={s.last}>{lastTakenText(lastTaken[medication.id])}</Text>
                {!!medication.instructions && <Text style={s.help}>{medication.instructions}</Text>}
                {medication.stock !== null ? (
                  <View style={s.stockBlock}>
                    <View style={s.stock}>
                      <View>
                        <Text style={medication.stock <= medication.lowStockThreshold ? s.stockLow : s.stockText}>Stock: {medication.stock}</Text>
                        <Text style={s.stockHint}>Aviso bajo: {medication.lowStockThreshold}</Text>
                      </View>
                      <View style={s.row}>
                        <Small label="−" onPress={() => adjustStock(medication, -1)} />
                        <Small label="+" onPress={() => adjustStock(medication, 1)} />
                      </View>
                    </View>
                    <View style={s.row}>
                      <Action label="Reponer +10" onPress={() => refillStock(medication, 10)} />
                      <Action label="Ver movimientos" onPress={() => toggleMovements(medication.id)} />
                    </View>
                    <View style={s.thresholdRow}>
                      <Text style={s.stockHint}>Umbral</Text>
                      <View style={s.row}>
                        <Small label="−" onPress={() => adjustThreshold(medication, -1)} />
                        <Small label="+" onPress={() => adjustThreshold(medication, 1)} />
                      </View>
                    </View>
                    {expandedStockId === medication.id ? (
                      <View style={s.movements}>
                        {(stockMovements[medication.id] ?? []).length ? (stockMovements[medication.id] ?? []).map((movement) => (
                          <View key={movement.id} style={s.movementRow}>
                            <View style={s.flex}>
                              <Text style={s.movementReason}>
                                {movement.reason === 'intake' ? 'Toma' : movement.reason === 'refill' ? 'Reposición' : movement.reason === 'correction' ? 'Corrección' : 'Ajuste'}
                              </Text>
                              {!!movement.note && <Text style={s.movementNote}>{movement.note}</Text>}
                            </View>
                            <Text style={movement.delta >= 0 ? s.movementPlus : s.movementMinus}>
                              {movement.delta >= 0 ? '+' : ''}{movement.delta} · {movement.balanceAfter}
                            </Text>
                          </View>
                        )) : <Text style={s.help}>Todavía no hay movimientos registrados.</Text>}
                      </View>
                    ) : null}
                  </View>
                ) : <Text style={s.stockDisabled}>Control de stock desactivado</Text>}
                <View style={s.row}>
                  <Action label="Editar" onPress={() => beginEdit(medication)} />
                  <Action label={medication.active ? 'Pausar' : 'Reanudar'} onPress={() => toggleActive(medication)} />
                </View>
                <Pressable style={s.archiveAction} onPress={() => archiveMedication(medication)}>
                  <Text style={s.archiveActionText}>Archivar medicamento</Text>
                </Pressable>
              </View>
            );
          }) : <Text style={s.help}>Aún no hay medicamentos configurados.</Text>}

          {archivedMedications.length ? (
            <>
              <Text style={s.section}>ARCHIVADOS</Text>
              <Text style={s.archiveHelp}>No generan recordatorios, pero su historial y sus datos siguen guardados.</Text>
              {archivedMedications.map((medication) => (
                <View key={medication.id} style={[s.med, s.archivedCard]}>
                  <View style={s.medTop}>
                    <View style={s.flex}>
                      <Text style={s.medName}>{medication.name}</Text>
                      <Text style={s.medDose}>{medication.dose}</Text>
                    </View>
                    <Text style={s.archivedBadge}>Archivado</Text>
                  </View>
                  <Text style={s.last}>{lastTakenText(lastTaken[medication.id])}</Text>
                  <Pressable style={s.restoreAction} onPress={() => void restoreMedication(medication)}>
                    <Text style={s.restoreActionText}>Restaurar y reactivar</Text>
                  </Pressable>
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <View style={s.field}><Text style={s.label}>{label}</Text>{children}</View>; }
function Input(props: React.ComponentProps<typeof TextInput>) { return <TextInput {...props} placeholderTextColor="#657793" style={s.input} autoCapitalize="none" />; }
function ModeButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { return <Pressable onPress={onPress} style={[s.mode, active && s.modeOn]}><Text style={[s.modeText, active && s.modeTextOn]}>{label}</Text></Pressable>; }
function Action({ label, onPress }: { label: string; onPress: () => void }) { return <Pressable style={s.action} onPress={onPress}><Text style={s.actionText}>{label}</Text></Pressable>; }
function Small({ label, onPress }: { label: string; onPress: () => void }) { return <Pressable style={s.small} onPress={onPress}><Text style={s.smallText}>{label}</Text></Pressable>; }

const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.bg},flex:{flex:1},content:{padding:22,paddingBottom:28},eyebrow:{color:'#86DCC2',fontSize:13,fontWeight:'900',letterSpacing:3.2},title:{color:colors.text,fontSize:28,lineHeight:34,fontWeight:'900',marginTop:7},subtitle:{color:colors.muted,fontSize:14,lineHeight:20,marginTop:6},
  card:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.line,borderRadius:24,padding:17,marginTop:20},editing:{borderColor:'#4B94FF'},banner:{flexDirection:'row',justifyContent:'space-between',paddingBottom:12,marginBottom:14,borderBottomWidth:1,borderBottomColor:colors.line},bannerText:{color:'#76AFFF',fontSize:11,fontWeight:'900'},cancel:{color:'#FF9AA4',fontWeight:'900'},
  field:{marginBottom:16},label:{color:'#C9D6E8',fontSize:12,fontWeight:'900',marginBottom:7},mini:{color:colors.muted,fontSize:10,fontWeight:'900',marginBottom:5},input:{minHeight:50,backgroundColor:colors.surface2,borderWidth:1,borderColor:colors.line,borderRadius:14,paddingHorizontal:14,color:colors.text,fontSize:16},help:{color:colors.muted,fontSize:11,lineHeight:16,marginTop:6},
  row:{flexDirection:'row',gap:8},half:{flex:1},mode:{flex:1,minHeight:48,borderRadius:14,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface2,alignItems:'center',justifyContent:'center'},modeOn:{borderColor:'#86DCC2',backgroundColor:'#12315A'},modeText:{color:colors.muted,fontSize:12,fontWeight:'900'},modeTextOn:{color:colors.text},
  timeRow:{flexDirection:'row',gap:8,alignItems:'center',marginBottom:8},removeTime:{width:48,height:50,borderRadius:14,borderWidth:1,borderColor:'#60313D',backgroundColor:'#21131A',alignItems:'center',justifyContent:'center'},removeTimeText:{color:'#FF9AA4',fontSize:24,fontWeight:'900'},addTime:{minHeight:46,borderRadius:14,borderWidth:1,borderColor:'#315F8E',alignItems:'center',justifyContent:'center',marginTop:2},addTimeText:{color:'#8FC0FF',fontSize:12,fontWeight:'900'},
  preview:{backgroundColor:'#0B182C',borderWidth:1,borderColor:'#1F3D61',borderRadius:15,padding:13,marginBottom:16},previewLabel:{color:'#86DCC2',fontSize:10,fontWeight:'900',letterSpacing:1.5},previewText:{color:colors.text,fontSize:13,lineHeight:20,fontWeight:'800',marginTop:5},error:{color:'#FF9AA4',fontSize:12,lineHeight:18,marginTop:6},
  days:{flexDirection:'row',gap:6},day:{flex:1,minHeight:42,borderRadius:12,borderWidth:1,borderColor:colors.line,alignItems:'center',justifyContent:'center'},dayOn:{backgroundColor:'#12315A',borderColor:colors.blue},dayText:{color:colors.muted,fontWeight:'900'},dayTextOn:{color:colors.text},message:{color:'#B6CBE7',fontSize:12,lineHeight:18,marginBottom:12},save:{minHeight:52,backgroundColor:colors.blue,borderRadius:16,alignItems:'center',justifyContent:'center'},saveText:{color:'#fff',fontSize:15,fontWeight:'900'},section:{color:'#76AFFF',fontSize:13,fontWeight:'900',letterSpacing:3,marginTop:30,marginBottom:11},
  med:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.line,borderRadius:22,padding:17,marginBottom:11},paused:{opacity:.68},medTop:{flexDirection:'row',alignItems:'flex-start',gap:10},medName:{color:colors.text,fontSize:18,fontWeight:'900'},medDose:{color:'#B7C8DF',fontSize:13,fontWeight:'800',marginTop:4},active:{color:'#7DE1C1',fontSize:10,fontWeight:'900',backgroundColor:'#103B35',paddingHorizontal:9,paddingVertical:6,borderRadius:999},inactive:{color:'#E7C77C',fontSize:10,fontWeight:'900',backgroundColor:'#332D22',paddingHorizontal:9,paddingVertical:6,borderRadius:999},medMode:{color:'#D8C3F4',fontSize:11,fontWeight:'900',marginTop:12},medMeta:{color:'#76AFFF',fontSize:12,fontWeight:'800',marginTop:5},duration:{color:'#C5D5E9',fontSize:11,fontWeight:'800',marginTop:6},last:{color:'#7DE1C1',fontSize:11,fontWeight:'800',marginTop:7},
  stockBlock:{marginTop:14,paddingTop:13,borderTopWidth:1,borderTopColor:colors.line},stock:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},stockText:{color:colors.text,fontSize:14,fontWeight:'900'},stockLow:{color:colors.warning,fontSize:14,fontWeight:'900'},stockHint:{color:colors.muted,fontSize:10,fontWeight:'800',marginTop:3},stockDisabled:{color:colors.muted,fontSize:11,fontWeight:'800',marginTop:12},thresholdRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:8},movements:{marginTop:10,backgroundColor:'#0B182C',borderRadius:14,padding:10},movementRow:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:8,borderBottomWidth:1,borderBottomColor:colors.line},movementReason:{color:colors.text,fontSize:11,fontWeight:'900'},movementNote:{color:colors.muted,fontSize:9,marginTop:2},movementPlus:{color:'#7DE1C1',fontSize:11,fontWeight:'900'},movementMinus:{color:'#FF9AA4',fontSize:11,fontWeight:'900'},small:{width:42,height:42,borderRadius:13,backgroundColor:colors.surface2,borderWidth:1,borderColor:colors.line,alignItems:'center',justifyContent:'center'},smallText:{color:colors.text,fontSize:22,fontWeight:'800'},action:{flex:1,minHeight:44,borderRadius:13,borderWidth:1,borderColor:colors.line,alignItems:'center',justifyContent:'center',marginTop:13},actionText:{color:'#A9CFFF',fontSize:12,fontWeight:'900'},
  archiveAction:{minHeight:42,borderRadius:13,borderWidth:1,borderColor:'#5B3440',alignItems:'center',justifyContent:'center',marginTop:9},archiveActionText:{color:'#FF9AA4',fontSize:12,fontWeight:'900'},archiveHelp:{color:colors.muted,fontSize:11,lineHeight:17,marginTop:-4,marginBottom:10},archivedCard:{opacity:.78,borderColor:'#3D3652'},archivedBadge:{color:'#C7B5DD',fontSize:10,fontWeight:'900',backgroundColor:'#2A2236',paddingHorizontal:9,paddingVertical:6,borderRadius:999},restoreAction:{minHeight:44,borderRadius:13,borderWidth:1,borderColor:'#315F8E',alignItems:'center',justifyContent:'center',marginTop:13},restoreActionText:{color:'#8FC0FF',fontSize:12,fontWeight:'900'}
});
