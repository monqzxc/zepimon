import { createWidget, widget, align, prop, text_style } from '@zos/ui'
import { push } from '@zos/router'
import { Distance } from '@zos/sensor'
import { LocalStorage } from '@zos/storage'
import { playLoader } from './loader'
import { ACTIVE_KEY, JOURNAL_KEY, readNext, nextEgg, phoneAdventure } from './saved'

// The title screen is where an adventure starts: it offers the next egg (the one chosen in Zepimon mobile, else a
// suggestion or your own pick) with Walk and Run, one tap each. It reads only the small next-egg and adventure keys
// and never loads the Pokemon catalog, so it opens quickly.
const text = (x, y, w, h, value, size, color = 0xE0E9D3) => createWidget(widget.TEXT, {
  x, y, w, h, text: value, text_size: size, color,
  align_h: align.CENTER_H, text_style: text_style.NONE
})
const rect = (x, y, w, h, color) => createWidget(widget.FILL_RECT, { x, y, w, h, color })
const panel = (x, y, w, h, fill, line = 0x69B989) => {
  rect(x + 3, y, w - 6, h, line)
  rect(x, y + 3, w, h - 6, line)
  rect(x + 3, y + 3, w - 6, h - 6, fill)
}
const sources = { phone: 'Chosen on your phone', suggested: 'A new Pokemon for your Dex', watch: 'Your pick' }

Page({
  build() {
    this.loader = null
    this.closed = false
    this.armed = false
    rect(0, 64, 320, 316, 0x041529)
    text(16, 64, 288, 29, 'Adventure Run', 24, 0xF0E5B1)

    // Next egg: a little night meadow with the egg on the grass.
    rect(12, 96, 296, 104, 0x10477C)
    const stars = [[118, 104], [176, 110], [242, 103], [296, 112], [140, 160]]
    stars.forEach(([x, y]) => rect(x, y, 2, 2, 0x95DFFF))
    rect(12, 174, 296, 26, 0x28624C)
    rect(12, 172, 296, 4, 0x358664)
    const egg = createWidget(widget.CANVAS, { x: 24, y: 104, w: 72, h: 72 })
    egg.drawImage({ x: 0, y: 0, w: 72, h: 72, image: 'pokemon/egg.png' })
    text(104, 104, 196, 18, 'NEXT EGG', 13, 0x95DFFF)
    this.eggName = text(104, 122, 196, 30, '', 22, 0xF0E5B1)
    this.eggSource = text(104, 152, 196, 18, '', 12, 0xD7E5DB)

    panel(12, 204, 296, 52, 0xDAE5BF)
    text(60, 207, 228, 18, "TODAY'S DISTANCE", 13, 0x082638)
    // A tiny pixel Pokeball beside the distance.
    rect(29, 224, 18, 22, 0x082638)
    rect(25, 229, 26, 12, 0x082638)
    rect(29, 226, 18, 8, 0xD95A5D)
    rect(29, 238, 18, 6, 0xE5EFDB)
    rect(34, 232, 8, 7, 0x082638)
    rect(36, 234, 4, 3, 0xE5EFDB)
    this.distanceText = text(62, 222, 182, 32, '--', 28, 0x082638)
    text(244, 232, 48, 22, 'km', 18, 0x082638)

    let active = null
    try {
      const storage = new LocalStorage()
      const stored = storage.getItem(ACTIVE_KEY)
      // Before the adventure screen has opened once after an update, the adventure in progress is in the journal.
      active = stored === undefined ? ((storage.getItem(JOURNAL_KEY) || {}).active || null) : stored
      this.next = readNext(storage)
    } catch (error) {
      console.log('Title adventure:', String(error))
      this.next = {}
    }
    this.active = active
    this.status = text(16, 258, 288, 18, '', 14)
    if (active) {
      this.button(12, 276, 296, 'Continue adventure  >', true, () => this.navigate({ view: 'home' }))
      this.button(12, 322, 296, 'History  >', false, () => this.navigate({ view: 'history' }))
    } else {
      this.button(12, 276, 144, 'Walk', true, () => this.go('walking'))
      this.button(164, 276, 144, 'Run', true, () => this.go('running'))
      this.button(12, 322, 144, 'Change egg', false, () => this.navigate({ view: 'new' }))
      this.button(164, 322, 144, 'History', false, () => this.navigate({ view: 'history' }))
    }
    this.showNext()

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
    // The phone may have chosen a new egg or started recording since the last visit.
    try { getApp()._options.fetchPlan((next) => { if (next && !this.closed) { this.next = next; this.showNext() } }) }
    catch (error) { console.log('Title plan:', String(error)) }
  },

  button(x, y, w, label, primary, action) {
    panel(x, y, w, 40, primary ? 0xE6EAB5 : 0x05263A)
    createWidget(widget.BUTTON, {
      x: x + 3, y: y + 2, w: w - 6, h: 36, radius: 0, text: label, text_size: label.length > 14 ? 18 : 20,
      color: primary ? 0x082638 : 0xD7E5DB, normal_color: primary ? 0xE6EAB5 : 0x05263A, press_color: primary ? 0xB6CB96 : 0x174A54,
      click_func: action
    })
  },

  showNext() {
    const egg = this.active ? null : nextEgg(this.next)
    const name = this.active ? 'In progress' : egg ? egg.family[0] : 'Surprise egg'
    this.eggName.setProperty(prop.TEXT, name)
    this.eggName.setProperty(prop.MORE, { text_size: name.length > 11 ? 18 : 22 })
    this.eggSource.setProperty(prop.TEXT, this.active ? 'Your adventure is waiting' : egg ? sources[egg.from] || '' : 'Any egg you have not hatched')
    const phone = !this.active && phoneAdventure(this.next)
    this.status.setProperty(prop.TEXT, this.active ? 'Adventure in progress' : phone ? 'Your phone is recording an adventure' : 'Ready to start')
  },

  // Starts with the offered egg. While the phone records, the first tap only warns: both would count the same steps.
  go(activity) {
    if (phoneAdventure(this.next) && !this.armed) {
      this.armed = true
      this.status.setProperty(prop.TEXT, 'Tap again to record here too')
      return
    }
    const egg = nextEgg(this.next)
    this.navigate({ start: { activity, family: egg ? egg.family : null, mega: egg ? egg.mega : null, planAt: egg && egg.planAt || 0 } })
  },

  navigate(params) {
    // The still Pokeball stays up while the adventure page loads; returning rebuilds this page.
    if (this.loader) return
    this.loader = playLoader(() => {
      try { push({ url: 'page/adventure', params }) }
      catch (error) {
        this.loader.remove()
        this.loader = null
        console.log('Zepimon navigation:', String(error))
        this.status.setProperty(prop.TEXT, String(error))
      }
    })
  },

  onDestroy() {
    this.closed = true
    if (this.loader) this.loader.stop()
    if (this.distance && this.distanceChanged) this.distance.offChange(this.distanceChanged)
  }
})
