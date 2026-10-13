import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { exportLocalBackup, resetAllLocalData, restoreLocalBackup, validateLocalBackup } from '@/src/data/medications';

function stamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function writeBackupFile(directory: typeof Paths.cache, prefix: string) {
  const backup = exportLocalBackup();
  const file = new File(directory, `${prefix}-${stamp()}.wfp`);
  file.create();
  file.write(JSON.stringify(backup, null, 2));
  return file;
}

export async function exportBackupFile() {
  const file = writeBackupFile(Paths.cache, 'WeekFlow-Pills-backup');
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Tu dispositivo no permite compartir archivos desde esta app.');
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Guardar respaldo de WeekFlow Pills',
  });

  return file.uri;
}

export function createPreventiveBackup() {
  const file = writeBackupFile(Paths.document, 'WeekFlow-Pills-pre-restore');
  return file.uri;
}

export async function pickAndRestoreBackup() {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    type: ['application/json', 'application/octet-stream', '*/*'],
  });

  if (result.canceled || !result.assets.length) return { restored: false as const };

  const asset = result.assets[0];
  const file = new File(asset.uri);
  let parsed: unknown;

  try {
    parsed = JSON.parse(file.textSync());
  } catch {
    throw new Error('El archivo seleccionado no contiene un respaldo válido.');
  }

  validateLocalBackup(parsed);
  const preventiveBackupUri = createPreventiveBackup();
  restoreLocalBackup(parsed);

  return {
    restored: true as const,
    preventiveBackupUri,
    sourceName: asset.name,
  };
}


export function resetAppToZero() {
  const preventiveBackupUri = createPreventiveBackup();
  resetAllLocalData();
  return preventiveBackupUri;
}
