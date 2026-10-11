import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/src/theme/colors';

const items = [
  { path: '/', label: 'Hoy', icon: '●' },
  { path: '/medications', label: 'Medicamentos', icon: '✚' },
  { path: '/history', label: 'Historial', icon: '◷' },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.shell, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {items.map((item) => {
        const active = item.path === '/' ? pathname === '/' : pathname.startsWith(item.path);
        return (
          <Pressable
            key={item.path}
            style={styles.item}
            onPress={() => router.replace(item.path)}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityHint={active ? 'Pestaña actual' : `Abre ${item.label}`}
            accessibilityState={{ selected: active }}
            hitSlop={6}
          >
            <Text style={[styles.icon, active && styles.active]}>{item.icon}</Text>
            <Text style={[styles.label, active && styles.active]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    backgroundColor: '#061126',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 9,
    paddingHorizontal: 8,
  },
  item: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 4 },
  icon: { color: colors.muted, fontSize: 19, fontWeight: '900' },
  label: { color: colors.muted, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  active: { color: '#76AFFF' },
});
