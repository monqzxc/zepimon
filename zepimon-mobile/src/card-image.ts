import type { RefObject } from 'react'
import { PixelRatio, Platform } from 'react-native'
import type { View } from 'react-native'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { Album, Asset, requestPermissionsAsync } from 'expo-media-library'
import { captureRef, releaseCapture } from 'react-native-view-shot'
import { CARD_PIXELS } from './ShareCard'

// Captures the share card (src/ShareCard.tsx) as a PNG, then saves it to the phone's gallery or opens the share sheet,
// where it can be saved to Files, printed or posted. Browsers download it instead (card-image.web.ts). Each returns a
// note for the screen.

// Saved pictures go in an album of this name (Android: Pictures/Zepimon).
const ALBUM = 'Zepimon'

// The gallery refused: blocked means only the phone's settings can allow it now.
export class GalleryDenied extends Error {
  constructor(public blocked: boolean) {
    super(blocked ? 'Photo access is off for Zepimon. Allow it in Settings, then save again.' : 'Allow Zepimon to add photos to save the image.')
  }
}

// The card as a named PNG in the cache: zepimon-pikachu-2026-10-27.png instead of a random temporary name.
async function captureCard(card: RefObject<View | null>, name: string): Promise<File> {
  // Android sizes a capture in pixels, iOS in points at the screen's scale: 1080 × 1920 pixels either way.
  // renderInContext draws the card's own layers on iOS, whatever the preview's scaling around it.
  const ratio = Platform.OS === 'ios' ? PixelRatio.get() : 1
  const captured = await captureRef(card, { format: 'png', result: 'tmpfile', width: CARD_PIXELS[0] / ratio,
    height: CARD_PIXELS[1] / ratio, useRenderInContext: true })
  const file = new File(Paths.cache, name)
  try {
    await new File(captured.startsWith('file://') ? captured : `file://${captured}`).copy(file, { overwrite: true })
  } finally {
    releaseCapture(captured)
  }
  return file
}

export async function exportCard(card: RefObject<View | null>, name: string): Promise<string> {
  const file = await captureCard(card, name)
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.')
  await Sharing.shareAsync(file.uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share your adventure' })
  return ''
}

// Asks once for permission to add photos (only photos, never reading the gallery), then saves the PNG to the
// gallery in the Zepimon album. If the album cannot be used, the picture still lands in the gallery.
export async function saveCardToGallery(card: RefObject<View | null>, name: string): Promise<string> {
  const permission = await requestPermissionsAsync(true, ['photo'])
  if (!permission.granted) throw new GalleryDenied(!permission.canAskAgain)
  const file = await captureCard(card, name)
  const asset = await Asset.create(file.uri)
  try {
    const album = await Album.get(ALBUM)
    if (album) await album.add(asset)
    else await Album.create(ALBUM, [asset])
    return `Saved to your gallery, in the ${ALBUM} album.`
  } catch {
    return 'Saved to your gallery.'
  }
}
