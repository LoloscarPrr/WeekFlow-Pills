import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Medication, ScheduleMode } from '@/src/domain/medication';
import { formatDays, generateTimesFromInterval, normalizeTimes, resolveMedicationTimes, weekdayOptions } from '@/src/domain/medication';
import { addMedication, listLastTakenByMedication, listMedications, setMedicationActive, setMedicationStock, updateMedication, type LastTaken } from '@/src/data/medications';
import { syncMedicationNotifications } from '@/src/services/notifications';
import { colors } from '@/src/theme/colors';

const allDays = [0, 1, 2, 3, 4, 5, 6];

function lastTakenText(last?: LastTaken) {
  if (!last) return 'Sin tomas registradas';
  const time = new Date(last.recordedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  return `Última toma: ${last.scheduledDate} · ${time}`;
}

export default function MedicationsScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [lastTaken, setLastTaken] = useState<Record<number, LastTaken>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [instructions, setInstructions] = useState('');
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('fixed');
  const [times, setTimes] = useState('09:00');
  const [intervalHours, setIntervalHours] = useState('6');
  const [startTime, setStartTime] = useState('09:00');
  const [days, setDays] = useState<number[]>(allDays);
  const [stock, setStock] = useState('');
  const [message, setMessage] = useState('');

  const refresh = () => {
    setMedications(listMedications());
    setLastTaken(listLastTakenByMedication());
  };
  useEffect(refresh, []);

  const resetForm = () => {
    setEditingId(null); setName(''); setDose(''); setInstructions(''); setScheduleMode('fixed');
    setTimes('09:00'); setIntervalHours('6'); setStartTime('09:00'); setDays(allDays); setStock('');
  };

  const beginEdit = (medication: Medication) => {
    setEditingId(medication.id); setName(medication.name); setDose(medication.dose); setInstructions(medication.instructions);
    setScheduleMode(medication.scheduleMode); setTimes(medication.times.length ? medication.times.join(', ') : '09:00');
    setIntervalHours(String(medication.intervalHours ?? 6)); setStartTime(medication.startTime ?? medication.times[0] ?? '09:00');
    setDays(medication.days); setStock(medication.stock === null ? '' : String(medication.stock));
    setMessage('Editando medicamento. Los recordatorios se actualizarán al guardar.');
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const toggleDay = (day: number) => setDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day]);

  let preview: string[] = [];
  let previewError = '';
  try {
    preview = scheduleMode === 'fixed' ? normalizeTimes(times) : generateTimesFromInterval(startTime, Number(intervalHours));
  } catch (error) {
    previewError = error instanceof Error ? error.message : 'Programación inválida.';
  }

  const save = async () => {
    try {
      setMessage('');
      if (!name.trim()) throw new Error('Escribe el nombre del medicamento.');
      if (!dose.trim()) throw new Error('Escribe la dosis indicada.');
      if (!days.length) throw new Error('Selecciona al menos un día.');

      let parsedTimes: string[] = [];
      let parsedInterval: number | null = null;
      let parsedStart: string | null = null;
      if (scheduleMode === 'fixed') {
        parsedTimes = normalizeTimes(times);
        if (!parsedTimes.length) throw new Error('Agrega al menos una hora específica.');
      } else {
        parsedInterval = Number(intervalHours);
        const generated = generateTimesFromInterval(startTime, parsedInterval);
        parsedStart = generated[0];
      }

      const parsedStock = stock.trim() === '' ? null : Number(stock);
      if (parsedStock !== null && (!Number.isInteger(parsedStock) || parsedStock < 0)) throw new Error('El stock debe ser un entero igual o mayor que 0.');
      const schedule = { scheduleMode, times: parsedTimes, intervalHours: parsedInterval, startTime: parsedStart };
      const common = { name: name.trim(), dose: dose.trim(), instructions: instructions.trim(), ...schedule, days: [...days].sort((a, b) => a - b), stock: parsedStock, lowStockThreshold: 5 };

      if (editingId !== null) {
        const current = medications.find((item) => item.id === editingId);
        if (!current) throw new Error('No se encontró el medicamento que estabas editando.');
        updateMedication({ ...current, ...common });
      } else {
        addMedication(common);
      }

      const wasEditing = editingId !== null;
      const notificationsEnabled = await syncMedicationNotifications();
      resetForm(); refresh();
      setMessage(notificationsEnabled ? (wasEditing ? 'Cambios guardados y recordatorios actualizados.' : 'Medicamento guardado y recordatorios actualizados.') : 'Cambios guardados. Activa las notificaciones para recibir recordatorios.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar.');
    }
  };

  const toggleActive = async (medication: Medication) => {
    setMedicationActive(medication.id, !medication.active); refresh();
    await syncMedicationNotifications().catch(() => undefined);
  };
  const adjustStock = (medication: Medication, delta: number) => {
    if (medication.stock === null) return;
    setMedicationStock(medication.id, Math.max(0, medication.stock + delta)); refresh();
  };

  return <SafeAreaView style={s.safe} edges={['top']}>
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scrollRef} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.eyebrow}>WEEKFLOW PILLS</Text>
        <Text style={s.title}>{editingId !== null ? 'Editar medicamento' : 'Configurar tratamiento'}</Text>
        <Text style={s.subtitle}>La dosis y la programación son datos separados. La app nunca interpreta frases como “cada 6 horas”.</Text>

        <View style={[s.card, editingId !== null && s.editing]}>
          {editingId !== null && <View style={s.banner}><Text style={s.bannerText}>MODO EDICIÓN</Text><Pressable onPress={() => { resetForm(); setMessage('Edición cancelada.'); }}><Text style={s.cancel}>Cancelar</Text></Pressable></View>}
          <Field label="Medicamento"><Input value={name} onChangeText={setName} placeholder="Ej. Losartán" /></Field>
          <Field label="Dosis indicada"><Input value={dose} onChangeText={setDose} placeholder="Ej. 1 comprimido · 50 mg" /></Field>
          <Field label="Programación">
            <View style={s.row}>
              <ModeButton active={scheduleMode === 'fixed'} label="Horas específicas" onPress={() => setScheduleMode('fixed')} />
              <ModeButton active={scheduleMode === 'interval'} label="Cada X horas" onPress={() => setScheduleMode('interval')} />
            </View>
          </Field>
          {scheduleMode === 'fixed' ? <Field label="Horarios"><Input value={times} onChangeText={setTimes} placeholder="09:00, 21:00" /><Text style={s.help}>Separa varios horarios con coma.</Text></Field> :
            <Field label="Intervalo"><View style={s.row}><View style={s.half}><Text style={s.mini}>Cada X horas</Text><Input value={intervalHours} onChangeText={setIntervalHours} placeholder="6" keyboardType="number-pad" /></View><View style={s.half}><Text style={s.mini}>Desde</Text><Input value={startTime} onChangeText={setStartTime} placeholder="09:00" /></View></View></Field>}
          <View style={s.preview}><Text style={s.previewLabel}>VISTA PREVIA</Text>{previewError ? <Text style={s.error}>{previewError}</Text> : <Text style={s.previewText}>{preview.length ? preview.join(' · ') : 'Sin horarios'}</Text>}<Text style={s.help}>Los días activos se aplican al día calendario real de cada toma.</Text></View>
          <Field label="Días"><View style={s.days}>{weekdayOptions.map((item) => <Pressable key={item.value} onPress={() => toggleDay(item.value)} style={[s.day, days.includes(item.value) && s.dayOn]}><Text style={[s.dayText, days.includes(item.value) && s.dayTextOn]}>{item.label}</Text></Pressable>)}</View></Field>
          <Field label="Indicaciones (opcional)"><Input value={instructions} onChangeText={setInstructions} placeholder="Ej. Con comida" /></Field>
          <Field label="Stock actual (opcional)"><Input value={stock} onChangeText={setStock} placeholder="Ej. 30" keyboardType="number-pad" /></Field>
          {!!message && <Text style={s.message}>{message}</Text>}
          <Pressable style={s.save} onPress={save}><Text style={s.saveText}>{editingId !== null ? 'Guardar cambios' : 'Guardar medicamento'}</Text></Pressable>
        </View>

        <Text style={s.section}>CONFIGURADOS</Text>
        {medications.length ? medications.map((medication) => {
          const effective = resolveMedicationTimes(medication);
          const mode = medication.scheduleMode === 'interval' ? `Cada ${medication.intervalHours} h · desde ${medication.startTime}` : 'Horas específicas';
          return <View key={medication.id} style={[s.med, !medication.active && s.paused]}>
            <View style={s.medTop}><View style={s.flex}><Text style={s.medName}>{medication.name}</Text><Text style={s.medDose}>{medication.dose}</Text></View><Text style={medication.active ? s.active : s.inactive}>{medication.active ? 'Activo' : 'Pausado'}</Text></View>
            <Text style={s.medMode}>{mode}</Text><Text style={s.medMeta}>{effective.join(' · ')} · {formatDays(medication.days)}</Text>
            <Text style={s.last}>{lastTakenText(lastTaken[medication.id])}</Text>
            {!!medication.instructions && <Text style={s.help}>{medication.instructions}</Text>}
            {medication.stock !== null && <View style={s.stock}><Text style={medication.stock <= medication.lowStockThreshold ? s.stockLow : s.stockText}>Stock: {medication.stock}</Text><View style={s.row}><Small label="−" onPress={() => adjustStock(medication, -1)} /><Small label="+" onPress={() => adjustStock(medication, 1)} /></View></View>}
            <View style={s.row}><Action label="Editar" onPress={() => beginEdit(medication)} /><Action label={medication.active ? 'Pausar' : 'Reanudar'} onPress={() => toggleActive(medication)} /></View>
          </View>;
        }) : <Text style={s.help}>Aún no hay medicamentos configurados.</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
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
  preview:{backgroundColor:'#0B182C',borderWidth:1,borderColor:'#1F3D61',borderRadius:15,padding:13,marginBottom:16},previewLabel:{color:'#86DCC2',fontSize:10,fontWeight:'900',letterSpacing:1.5},previewText:{color:colors.text,fontSize:14,lineHeight:22,fontWeight:'900',marginTop:6},error:{color:'#FF9AA4',fontSize:12,lineHeight:18,marginTop:6},
  days:{flexDirection:'row',gap:6},day:{flex:1,minHeight:42,borderRadius:12,borderWidth:1,borderColor:colors.line,alignItems:'center',justifyContent:'center'},dayOn:{backgroundColor:'#12315A',borderColor:colors.blue},dayText:{color:colors.muted,fontWeight:'900'},dayTextOn:{color:colors.text},message:{color:'#B6CBE7',fontSize:12,lineHeight:18,marginBottom:12},save:{minHeight:52,backgroundColor:colors.blue,borderRadius:16,alignItems:'center',justifyContent:'center'},saveText:{color:'#fff',fontSize:15,fontWeight:'900'},section:{color:'#76AFFF',fontSize:13,fontWeight:'900',letterSpacing:3,marginTop:30,marginBottom:11},
  med:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.line,borderRadius:22,padding:17,marginBottom:11},paused:{opacity:.68},medTop:{flexDirection:'row',alignItems:'flex-start',gap:10},medName:{color:colors.text,fontSize:18,fontWeight:'900'},medDose:{color:'#B7C8DF',fontSize:13,fontWeight:'800',marginTop:4},active:{color:'#7DE1C1',fontSize:10,fontWeight:'900',backgroundColor:'#103B35',paddingHorizontal:9,paddingVertical:6,borderRadius:999},inactive:{color:'#E7C77C',fontSize:10,fontWeight:'900',backgroundColor:'#332D22',paddingHorizontal:9,paddingVertical:6,borderRadius:999},medMode:{color:'#D8C3F4',fontSize:11,fontWeight:'900',marginTop:12},medMeta:{color:'#76AFFF',fontSize:12,fontWeight:'800',marginTop:5},last:{color:'#7DE1C1',fontSize:11,fontWeight:'800',marginTop:7},
  stock:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:14,paddingTop:13,borderTopWidth:1,borderTopColor:colors.line},stockText:{color:colors.text,fontSize:14,fontWeight:'900'},stockLow:{color:colors.warning,fontSize:14,fontWeight:'900'},small:{width:42,height:42,borderRadius:13,backgroundColor:colors.surface2,borderWidth:1,borderColor:colors.line,alignItems:'center',justifyContent:'center'},smallText:{color:colors.text,fontSize:22,fontWeight:'800'},action:{flex:1,minHeight:44,borderRadius:13,borderWidth:1,borderColor:colors.line,alignItems:'center',justifyContent:'center',marginTop:13},actionText:{color:'#A9CFFF',fontSize:12,fontWeight:'900'}
});
