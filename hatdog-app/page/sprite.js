import { createWidget, widget } from '@zos/ui'
import { spritePath } from './pokemon'
import { walkSprites } from './walk-sprites'

// Image files that hold two walking poses side by side. Built on first use, not while the page loads.
let sheets = null
function isSheet(path) {
  if (!sheets) {
    sheets = {}
    Object.keys(walkSprites).forEach(name => {
      sheets[spritePath(name)] = true
      sheets[spritePath(name, true)] = true
    })
  }
  return !!sheets[path]
}

export function drawSprite(canvas, name, shiny, size, frame = 0) {
  const path = spritePath(name, shiny)
  const sheet = isSheet(path)
  const pose = walkSprites[name.replace(/^Shiny /, '')] ? frame : 0
  canvas.clear({ x: 0, y: 0, w: size, h: size })
  // The canvas clips the other pose; both frames share one installed image file.
  canvas.drawImage({ x: sheet ? -pose * size : 0, y: 0, w: sheet ? size * 2 : size, h: size, image: path })
}

export function createSprite(x, y, size, name, shiny = false) {
  const canvas = createWidget(widget.CANVAS, { x, y, w: size, h: size })
  drawSprite(canvas, name, shiny, size)
  return canvas
}
