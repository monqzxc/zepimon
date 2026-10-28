import type { RefObject } from 'react'
import { PixelRatio } from 'react-native'
import type { View } from 'react-native'
import html2canvas from 'html2canvas'
import { CARD_PIXELS } from './ShareCard'

// The browser version of card-image.ts: html2canvas draws the card and the PNG downloads.
export async function exportCard(card: RefObject<View | null>, name: string): Promise<string> {
  const element = card.current as unknown as HTMLElement | null
  if (!element) throw new Error('The card is not ready yet.')
  // The canvas starts in the card's own colour (transparent for a clear card), so the edge pixels a fractional
  // card width leaves part-covered are not see-through on a dark one.
  const drawn = await html2canvas(element, { backgroundColor: getComputedStyle(element).backgroundColor, scale: PixelRatio.get(), logging: false,
    // The preview shrinks the card with a transform on its parent; the copy html2canvas draws is left full size.
    onclone: (_document, clone) => { if (clone.parentElement) clone.parentElement.style.transform = 'none' } })
  // html2canvas rounds a fractional card width up (1080 / 2.625 px), so trim the extra pixel to 1080 × 1920.
  const canvas = document.createElement('canvas')
  canvas.width = CARD_PIXELS[0]
  canvas.height = CARD_PIXELS[1]
  canvas.getContext('2d')?.drawImage(drawn, 0, 0)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('This browser could not make the image.')
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return `Saved ${name} to your downloads.`
}

// Browsers have no gallery: saving is the same download.
export const saveCardToGallery = exportCard

// Matches card-image.ts; a browser never refuses a download this way.
export class GalleryDenied extends Error {
  constructor(public blocked: boolean) { super('') }
}
