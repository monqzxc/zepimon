import { Modal, Pressable, View } from 'react-native'
import { Button, Copy, Heading, Panel } from './ui'

type Props = {
  visible: boolean, title: string, body: string, confirm: string, cancel: string,
  onConfirm: () => void, onCancel: () => void
}

// A yes-or-no question over the whole screen, for a step that is easy to take by accident (leaving a game, starting
// over). Tapping outside it, or Android's back button, answers no. The safe choice comes first.
export function ConfirmDialog({ visible, title, body, confirm, cancel, onConfirm, onCancel }: Props) {
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onCancel}>
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Pressable accessibilityLabel={cancel} onPress={onCancel}
        style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8, 8, 20, 0.55)' }} />
      <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 420 }}>
        <Panel>
          <Heading>{title}</Heading>
          <Copy>{body}</Copy>
          <View style={{ gap: 10 }}>
            <Button title={cancel} onPress={onCancel} />
            <Button title={confirm} secondary onPress={onConfirm} />
          </View>
        </Panel>
      </View>
    </View>
  </Modal>
}
