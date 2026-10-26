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
const unit = 9          // screen pixels per ball pixel: a 126 px ball
const paintMs = 30      // one frame for the watch to show the ball before it starts the slow work

// Covers the content below the system header with a still Pokeball, then calls done once it is on screen. The watch
// cannot draw while done runs (loading the next page), so the ball stays up until that page replaces it. Taps on the
// cover are ignored. It used to pulse first, which only delayed the next page.
export function playLoader(done) {
  const left = 160 - 7 * unit
  const top = 200 - 7 * unit
  const parts = [
    createWidget(widget.FILL_RECT, { x: 0, y: 64, w: 320, h: 316, color: 0x031A2C }),
    createWidget(widget.TEXT, { x: 20, y: 296, w: 280, h: 28, text: 'Loading...', text_size: 18,
      color: 0x8CD3F5, align_h: align.CENTER_H }),
    ...ball.map(([x, y, w, h, color]) => createWidget(widget.FILL_RECT, { x: left + x * unit, y: top + y * unit, w: w * unit, h: h * unit, color }))
  ]
  let timer = setTimeout(() => { timer = undefined; done() }, paintMs)
  const stop = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  return {
    stop,
    remove() {
      stop()
      parts.forEach(item => deleteWidget(item))
      parts.length = 0
    }
  }
}
