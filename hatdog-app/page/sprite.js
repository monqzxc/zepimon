import { createWidget, widget } from '@zos/ui'
import { spritePath } from './pokemon'
import { spriteForm } from '../shared/forms'
import { walkSprites } from './walk-sprites'

// Whether an image file holds two walking poses side by side. A walking form's own file always does; another form's
// file does when a walking form shares it (Mega Zygarde draws Zygarde's), which is looked up the first time that file
// is drawn. A table of every sheet's path cost the watch about 70 KB of memory.
const sheets = {}
function isSheet(path) {
  if (sheets[path] === undefined) {
    sheets[path] = false
    for (const name in walkSprites) {
      if (spritePath(name) === path || spritePath(name, true) === path) { sheets[path] = true; break }
    }
  }
  return sheets[path]
}

export function drawSprite(canvas, name, shiny, size, frame = 0) {
  const path = spritePath(name, shiny)
  // A Dynamax form walks in its species' poses.
  const walks = !!walkSprites[spriteForm(name).replace(/^Shiny /, '')]
  const sheet = walks || isSheet(path)
  const pose = walks ? frame : 0
  canvas.clear({ x: 0, y: 0, w: size, h: size })
  // The canvas clips the other pose; both frames share one installed image file.
  canvas.drawImage({ x: sheet ? -pose * size : 0, y: 0, w: sheet ? size * 2 : size, h: size, image: path })
}

export function createSprite(x, y, size, name, shiny = false) {
  const canvas = createWidget(widget.CANVAS, { x, y, w: size, h: size })
  drawSprite(canvas, name, shiny, size)
  return canvas
}
