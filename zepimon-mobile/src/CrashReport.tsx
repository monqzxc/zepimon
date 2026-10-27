import { useState, type PropsWithChildren } from 'react'
import { Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Constants from 'expo-constants'
import type { ErrorBoundaryProps } from 'expo-router'
import { acknowledgeCrash, lastCrash } from '../modules/zepimon-diagnostics'
import { useTracker } from './tracker'
import { colors } from './ui'

// Crash reports anyone can send, without a computer or developer options. Both screens use only plain React Native
// views and the system font, so they still work when the app's own components are what failed.

function share(report: string) {
  Share.share({ message: report }).catch(() => {})
}

// Shown once after Zepimon closed unexpectedly, with what the crash recorder (modules/zepimon-diagnostics) caught.
export function CrashReport() {
  const [report, setReport] = useState(lastCrash)
  const { active, screenOnly } = useTracker()
  if (!report) return null
  const close = () => { acknowledgeCrash(); setReport(null) }
  return <Modal animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
    <Report title="Zepimon closed unexpectedly" report={report} actions={[['Share report', () => share(report)], ['Close', close]]}>
      Here is what the app recorded when it closed. Tap Share report to send it by chat or email so the cause can be fixed.
      {active ? screenOnly ? ' Your adventure in progress is kept. For now Zepimon records only while it is open on screen: resume it in the Adventure tab.'
        : ' Your adventure in progress is kept: resume it in the Adventure tab.' : ''}
    </Report>
  </Modal>
}

// The root layout's error boundary: an error on any screen shows this instead of closing the app.
export function CrashScreen({ error, retry }: ErrorBoundaryProps) {
  const report = `Zepimon ${Constants.expoConfig?.version ?? ''} on ${Platform.OS} ${Platform.Version}\n\n` +
    `${error.message}\n\n${error.stack ?? ''}`.slice(0, 16000)
  return <Report title="Something went wrong" report={report} actions={[['Try again', () => { void retry() }], ['Share report', () => share(report)]]}>
    Zepimon hit an error on this screen. Your journal is safe. Try again, or share the report so it can be fixed.
  </Report>
}

function Report({ title, children, report, actions }: PropsWithChildren<{ title: string, report: string, actions: [string, () => void][] }>) {
  const insets = useSafeAreaInsets()
  return <View style={[sheet.page, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
    <Text accessibilityRole="header" style={sheet.title}>{title}</Text>
    <Text style={sheet.intro}>{children}</Text>
    <ScrollView style={sheet.box} contentContainerStyle={{ padding: 12 }}>
      <Text selectable style={sheet.report}>{report}</Text>
    </ScrollView>
    {actions.map(([label, onPress], index) => <Pressable key={label} accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => [sheet.button, index > 0 && sheet.secondary, pressed && { opacity: 0.85 }]}>
      <Text style={[sheet.buttonText, index > 0 && { color: colors.edge }]}>{label}</Text>
    </Pressable>)}
  </View>
}

const sheet = StyleSheet.create({
  page: { flex: 1, gap: 12, paddingHorizontal: 20, backgroundColor: colors.bg },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink },
  intro: { fontSize: 15, lineHeight: 22, color: colors.muted },
  box: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel },
  report: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11, lineHeight: 16, color: colors.ink },
  button: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: colors.edge },
  secondary: { backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.edge },
  buttonText: { fontSize: 16, fontWeight: '800', color: colors.onBrand }
})
