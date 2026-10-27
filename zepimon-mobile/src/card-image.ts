import type { RefObject } from 'react'
import { PixelRatio, Platform } from 'react-native'
import type { View } from 'react-native'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { captureRef, releaseCapture } from 'react-native-view-shot'
import { CARD_PIXELS } from './ShareCard'

// Captures the share card (src/ShareCard.tsx) as a PNG and opens the share sheet, where it can be saved to Photos or
// Files, printed or posted. Browsers download it instead (card-image.web.ts). Returns a note for the screen.
export async function exportCard(card: RefObject<View | null>, name: string): Promise<string> {
  // Android sizes a capture in pixels, iOS in points at the screen's scale: 1080 × 1920 pixels either way.
  // renderInContext draws the card's own layers on iOS, whatever the preview's scaling around it.
  const ratio = Platform.OS === 'ios' ? PixelRatio.get() : 1
  const captured = await captureRef(card, { format: 'png', result: 'tmpfile', width: CARD_PIXELS[0] / ratio,
    height: CARD_PIXELS[1] / ratio, useRenderInContext: true })
  // A named copy, so the saved file reads zepimon-pikachu-2026-10-27.png instead of a random temporary name.
  const file = new File(Paths.cache, name)
  try {
    await new File(captured.startsWith('file://') ? captured : `file://${captured}`).copy(file, { overwrite: true })
  } finally {
    releaseCapture(captured)
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.')
  await Sharing.shareAsync(file.uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share your adventure' })
  return ''
}
