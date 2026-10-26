import { createWidget, deleteWidget, widget, align } from '@zos/ui'

const dark = 0x082638
const red = 0xD95A5D
const cream = 0xE5EFDB
const shine = 0xF3B8B0
// A 14 x 14 pixel Pokeball painted back to front as [x, y, w, h, color] in pixel units.
// Rows 6-7 keep the dark outline layer as the center band.
const ball = [
  [4, 0, 6, 14, dark], [2, 1, 10, 12, dark], [1, 2, 12, 10, dark], [0, 4, 14, 6, dark],
  [4, 1, 6, 5, red], [3, 2, 8, 4, red], [2, 3, 10, 3, red], [1, 4, 12, 2, red],
  [4, 8, 6, 5, cream], [3, 8, 8, 4, cream], [2, 8, 10, 3, cream], [1, 8, 12, 2, cream],
  [5, 4, 4, 6, dark], [4, 5, 6, 4, dark], [6, 5, 2, 4, cream], [5, 6, 4, 2, cream],
  [4, 2, 2, 1, shine], [3, 3, 1, 2, shine]
]
// Screen pixels per ball pixel: one pulse from 126 px down to 70 px and back in about 0.28 s.
// Small steps at both ends ease the pulse in and let it settle at full size.
const units = [9, 8, 6, 5, 6, 8, 9]
const frameMs = 40

// Covers the content below the system header, pulses the ball once, then calls done.
// The watch cannot animate while done runs, so the full-size ball stays up while it builds the next screen.
export function playLoader(done) {
  const cover = [
    createWidget(widget.FILL_RECT, { x: 0, y: 64, w: 320, h: 316, color: 0x031A2C }),
    createWidget(widget.TEXT, { x: 20, y: 296, w: 280, h: 28, text: 'Loading...', text_size: 18,
      color: 0x8CD3F5, align_h: align.CENTER_H })
  ]
  let parts = []
  let frame = 0
  let timer
  const draw = () => {
    const unit = units[frame]
    const left = 160 - 7 * unit
    const top = 200 - 7 * unit
    // Draw the smaller ball before deleting the larger one so no frame is blank.
    const next = ball.map(([x, y, w, h, color]) => createWidget(widget.FILL_RECT, {
      x: left + x * unit, y: top + y * unit, w: w * unit, h: h * unit, color
    }))
    parts.forEach(item => deleteWidget(item))
    parts = next
  }
  const tick = () => {
    timer = undefined
    if (++frame < units.length) {
      draw()
      timer = setTimeout(tick, frameMs)
    } else done()
  }
  draw()
  timer = setTimeout(tick, frameMs)
  const stop = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  return {
    stop,
    remove() {
      stop()
      cover.concat(parts).forEach(item => deleteWidget(item))
      cover.length = 0
      parts = []
    }
  }
}
