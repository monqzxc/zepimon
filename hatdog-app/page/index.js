import { createWidget, widget, align, prop, text_style } from '@zos/ui'
import { push } from '@zos/router'
import { Distance } from '@zos/sensor'
import { LocalStorage } from '@zos/storage'
import { createSprite } from './sprite'
import { playLoader } from './loader'

const text = (x, y, w, h, value, size, color = 0xE0E9D3) => createWidget(widget.TEXT, {
  x, y, w, h, text: value, text_size: size, color,
  align_h: align.CENTER_H, text_style: text_style.NONE
})
const rect = (x, y, w, h, color) => createWidget(widget.FILL_RECT, { x, y, w, h, color })

Page({
  build() {
    this.loader = null
    // Leave 64 pixels for the watch header; native scenery reuses the Gible sprite.
    rect(0, 64, 320, 316, 0x041529)
    const panel = (x, y, w, h, fill) => {
      rect(x + 3, y, w - 6, h, 0x69B989)
      rect(x, y + 3, w, h - 6, 0x69B989)
      rect(x + 3, y + 3, w - 6, h - 6, fill)
    }
    text(16, 64, 288, 29, 'Adventure Run', 24, 0xF0E5B1)
    text(16, 93, 288, 16, 'Track your walk & run distance', 13)
    rect(12, 112, 296, 91, 0x10477C)
    const stars = [[31,121],[92,115],[146,128],[197,117],[303,137]]
    stars.forEach(([x, y]) => rect(x, y, 2, 2, 0x95DFFF))
    rect(267, 119, 15, 13, 0xF1E8A5)
    rect(270, 116, 9, 19, 0xF1E8A5)
    rect(264, 115, 9, 13, 0x10477C)
    const peaks = [18,27,16,33,22,15,27,17]
    peaks.forEach((height, i) => rect(12 + i * 37, 165 - height, 37, height, 0x0B2C50))
    rect(12, 164, 296, 17, 0x155D7A)
    rect(98, 168, 73, 2, 0x2B8A96)
    rect(135, 175, 59, 2, 0x2B8A96)
    rect(12, 181, 296, 22, 0x28624C)
    rect(130, 181, 25, 7, 0xBEA767)
    rect(119, 188, 47, 7, 0xA28E55)
    rect(108, 195, 69, 8, 0xBEA767)
    const trees = [[24,141],[58,154],[283,146]]
    trees.forEach(([x, y]) => {
      rect(x + 8, y + 17, 5, 27, 0x755337)
      rect(x + 8, y, 5, 10, 0x73B46D)
      rect(x + 3, y + 7, 15, 14, 0x398463)
      rect(x - 2, y + 18, 25, 13, 0x164A48)
    })
    createSprite(196, 108, 96, 'Gible')

    panel(12, 205, 296, 60, 0xDAE5BF)
    text(60, 208, 228, 20, "TODAY'S DISTANCE", 15, 0x082638)
    // A tiny pixel Pokeball beside the distance label.
    rect(29, 225, 18, 22, 0x082638)
    rect(25, 230, 26, 12, 0x082638)
    rect(29, 227, 18, 8, 0xD95A5D)
    rect(29, 239, 18, 6, 0xE5EFDB)
    rect(34, 233, 8, 7, 0x082638)
    rect(36, 235, 4, 3, 0xE5EFDB)
    this.distanceText = text(62, 225, 182, 38, '--', 32, 0x082638)
    text(244, 238, 48, 25, 'km', 20, 0x082638)
    let active = false
    try {
      const saved = new LocalStorage().getItem('zepimon-v1')
      active = !!(saved && saved.active)
    } catch (error) { console.log('Title adventure:', String(error)) }
    this.status = text(16, 267, 288, 18, active ? 'Adventure in progress' : 'Ready to start', 14)
    panel(12, 286, 296, 40, 0xE6EAB5)
    createWidget(widget.BUTTON, {
      x: 15, y: 288, w: 290, h: 36, radius: 0,
      text: (active ? 'Continue adventure' : 'Start Adventure') + '  >', text_size: 20, color: 0x082638,
      normal_color: 0xE6EAB5, press_color: 0xB6CB96,
      click_func: () => this.navigate('home')
    })
    panel(12, 330, 296, 40, 0x05263A)
    createWidget(widget.BUTTON, {
      x: 15, y: 332, w: 290, h: 36, radius: 0,
      text: 'History  >', text_size: 18, color: 0xD7E5DB,
      normal_color: 0x05263A, press_color: 0x174A54,
      click_func: () => this.navigate('history')
    })
    try {
      this.distance = new Distance()
      this.distanceChanged = () => {
        const meters = this.distance.getCurrent()
        this.distanceText.setProperty(prop.TEXT, Number.isFinite(meters) && meters >= 0 ? (meters / 1000).toFixed(2) : '--')
      }
      this.distance.onChange(this.distanceChanged)
      this.distanceChanged()
    } catch (error) {
      console.log('Title distance:', String(error))
      this.status.setProperty(prop.TEXT, 'Distance unavailable')
    }
  },
  navigate(view) {
    // The pulsing Pokeball stays up while the adventure page loads; returning rebuilds this page.
    if (this.loader) return
    this.loader = playLoader(() => {
      try { push({ url: 'page/adventure', params: { view } }) }
      catch (error) {
        this.loader.remove()
        this.loader = null
        console.log('Zepimon navigation:', String(error))
        this.status.setProperty(prop.TEXT, String(error))
      }
    })
  },
  onDestroy() {
    if (this.loader) this.loader.stop()
    if (this.distance && this.distanceChanged) this.distance.offChange(this.distanceChanged)
  }
})
