import { createWidget, deleteWidget, widget, align, prop, text_style, event } from '@zos/ui'
import { Distance, Step } from '@zos/sensor'
import { LocalStorage } from '@zos/storage'
import { setWakeUpRelaunch } from '@zos/display'
import { routes, speciesCount, generation, megaChoices, rollShiny, collectionCount, dexPokemon, primaryType, spritePath, nextMilestone, currentForm, elapsedSeconds, elapsedLabel, paceLabel, updateSession, finishSession } from './pokemon'

const ink = 0xFFFFFF
const muted = 0x8CD3F5
const panelFill = 0x062138
const edge = 0x43B5EC
const selectedFill = 0x0C97C5
// Rectangular watches draw their own app-name/time header in the top 64 pixels.
const contentTop = 64
const themes = {
  normal: [0x201C28, 0x817581], fire: [0x301A16, 0xE97938], water: [0x102434, 0x479FE3],
  grass: [0x132B20, 0x64B862], electric: [0x2D2812, 0xEDCA46], ice: [0x153038, 0x82D4DF],
  fighting: [0x301B1B, 0xCF6655], poison: [0x28182E, 0xB268CC], ground: [0x2D2418, 0xC1A46A],
  flying: [0x1C2534, 0x92B6DF], psychic: [0x321A2C, 0xE47FA8], bug: [0x242C17, 0xA1BA56],
  rock: [0x2B271D, 0xAC9D72], ghost: [0x211831, 0x9D7BD3], dragon: [0x1A2038, 0x797FDB],
  dark: [0x191B24, 0x747E9A], steel: [0x1F2A2D, 0x90B0B6], fairy: [0x311D2C, 0xE9A2CC]
}

const km = (meters) => (meters / 1000).toFixed(2) + ' km'
const dayKey = () => {
  const now = new Date()
  return now.getFullYear() + '-' + now.getMonth() + '-' + now.getDate()
}

Page({
  onInit(params) {
    try {
      const options = typeof params === 'string' ? JSON.parse(params) : params
      this.requestedView = options && ['home', 'new', 'existing'].includes(options.view) ? options.view : null
    } catch (_) { this.requestedView = null }
  },
  build() {
    this.widgets = []
    this.stats = null
    this.ready = false
    this.distance = null
    this.step = null
    this.changed = null
    let stage = 'storage'
    try {
      this.storage = new LocalStorage()
      this.state = this.storage.getItem('zepimon-v1') || { dex: {}, records: {}, active: null }
      if (!this.state.dex || !this.state.records) throw new Error('Invalid saved data')
      this.view = this.state.active ? 'session' : this.requestedView || 'home'
      this.index = 0
      this.selectedGeneration = 1
      this.megaIndex = 0
      stage = 'screen'
      this.render()
      stage = 'sensors'
      this.distance = new Distance()
      this.step = new Step()
      this.changed = () => this.sync()
      this.distance.onChange(this.changed)
      this.step.onChange(this.changed)
      stage = 'wake-up'
      setWakeUpRelaunch({ relaunch: !!this.state.active })
      stage = 'session'
      this.sync()
      this.ready = true
    } catch (error) {
      this.stopMotion()
      console.log('Zepimon startup:', stage, String(error))
      if (error && error.stack) console.log(error.stack)
      this.widgets.forEach((item) => deleteWidget(item))
      this.widgets = []
      // Draw directly so startup failures in page helpers cannot hide the error.
      createWidget(widget.TEXT, {
        x: 12, y: contentTop + 8, w: 296, h: 55, text: 'Zepimon startup error',
        text_size: 22, color: 0xFF7777, align_h: align.CENTER_H
      })
      createWidget(widget.TEXT, {
        x: 12, y: 140, w: 296, h: 220, text: stage + '\n' + String(error),
        text_size: 18, color: 0xFFFFFF, text_style: text_style.WRAP
      })
    }
  },

  save() { this.storage.setItem('zepimon-v1', this.state) },

  sync() {
    if (!this.state.active) return
    updateSession(this.state.active, this.distance.getCurrent(), this.step.getCurrent(), dayKey())
    this.save()
    if (this.view === 'session' && this.stats) this.refreshStats()
  },

  rect(x, y, w, h, color) {
    const item = createWidget(widget.FILL_RECT, { x, y, w, h, color })
    this.widgets.push(item)
    return item
  },

  panel(x, y, w, h, fill = panelFill) {
    this.rect(x + 3, y, w - 6, h, edge)
    this.rect(x, y + 3, w, h - 6, edge)
    this.rect(x + 3, y + 3, w - 6, h - 6, panelFill)
    return this.rect(x + 6, y + 6, w - 12, h - 12, fill)
  },

  text(y, text, size = 22, color = ink, height = 32, x = 20, w = 280) {
    const item = createWidget(widget.TEXT, {
      x, y, w, h: height, text, text_size: size, color,
      align_h: align.CENTER_H, text_style: text_style.WRAP
    })
    this.widgets.push(item)
    return item
  },

  button(y, text, action, x = 20, w = 280, selected = false, h = 42) {
    this.rect(x + 3, y, w - 6, h, edge)
    this.rect(x, y + 3, w, h - 6, edge)
    this.widgets.push(createWidget(widget.BUTTON, {
      x: x + 3, y: y + 3, w: w - 6, h: h - 6, radius: 0, text,
      text_size: text.length > 23 ? 16 : 19, color: ink,
      normal_color: selected ? selectedFill : 0x095CA5, press_color: 0x073F75, click_func: action
    }))
  },

  image(y, name, shiny = false, onClick, size = 96) {
    const x = (320 - size) / 2
    const item = createWidget(widget.IMG, { x, y, w: size, h: size, auto_scale: true, src: spritePath(name, shiny) })
    this.widgets.push(item)
    if (onClick) item.addEventListener(event.CLICK_UP, onClick)
    this.moving.push({ item, x, y })
    if (this.motionTimer === undefined) {
      let frame = 0
      const offsets = [0, -2, -4, -2, 0, 1]
      this.motionTimer = setInterval(() => {
        frame = (frame + 1) % offsets.length
        this.moving.forEach(({ item: sprite, x: baseX, y: baseY }) => sprite.setProperty(prop.MORE, { x: baseX, y: baseY + offsets[frame] }))
        if (this.view === 'session' && this.clockStats) this.refreshClock()

      }, 400)
    }
    return item
  },

  stopMotion() {
    if (this.motionTimer !== undefined) clearInterval(this.motionTimer)
    this.motionTimer = undefined
    this.moving = []
  },

  background(name = 'Egg') {
    const colors = themes[primaryType(name)] || themes.normal
    this.rect(0, contentTop, 320, 380 - contentTop, 0x031A2C)
    const base = this.panel(10, 64, 300, 314, colors[0])
    const accents = [this.rect(24, 100, 272, 2, colors[1]), this.rect(24, 372, 272, 2, colors[1])]
    this.backdrop = { base, accents }
  },

  updateBackground(name) {
    const colors = themes[primaryType(name)] || themes.normal
    this.backdrop.base.setProperty(prop.MORE, { color: colors[0] })
    this.backdrop.accents.forEach((item) => item.setProperty(prop.MORE, { color: colors[1] }))
  },

  openDex(name) { this.dexName = name; this.dexShiny = !this.state.dex[name]; this.view = 'dex-detail'; this.render() },

  renderGenerationPicker() {
    this.rect(0, contentTop, 320, 380 - contentTop, 0x031A2C)
    this.panel(14, 68, 292, 42)
    this.text(74, 'Choose a generation', 21, 0xF2E4B5, 30)
    for (let gen = 1; gen <= 6; gen++) {
      const y = 116 + (gen - 1) * 43
      const selected = gen <= 5 && this.selectedGeneration === gen
      const title = gen === 6 ? 'Back' : gen <= 4 ? 'Generation ' + gen : 'Extra Mega families'
      this.button(y, title, () => {
        if (gen === 6) { this.show('home'); return }
        this.selectedGeneration = gen
        this.show('choose')
      }, 24, 272, selected, 38)
      if (selected) {
        this.rect(36, y + 10, 4, 18, 0xF4EAC7)
        this.rect(40, y + 13, 4, 12, 0xF4EAC7)
        this.rect(44, y + 16, 4, 6, 0xF4EAC7)
      }
    }
  },

  renderHub() {
    this.rect(0, contentTop, 320, 380 - contentTop, 0x031A2C)
    this.panel(14, 68, 292, 150)
    this.text(72, 'Walk. Hatch. Evolve.', 22, ink, 28)
    this.text(101, collectionCount(this.state.dex) + ' / ' + speciesCount + ' acquired', 16, muted, 22)
    const heights = [18,30,44,29,19,27,35,23,16,29,38,24,17,28,42,25,18,31]
    heights.forEach((height, i) => this.rect(18 + i * 16, 209 - height, 16, height, i % 2 ? 0x104467 : 0x0B3655))
    const stars = [[32,134],[57,155],[95,138],[240,141],[286,132],[272,165]]
    stars.forEach(([x,y]) => this.rect(x, y, 3, 3, 0xF0DE91))
    this.rect(20, 207, 280, 5, 0x358664)
    for (let i = 0; i < 8; i++) this.rect(27 + i * 36, 202 + i % 2 * 3, 4, 9, 0x79B66B)
    this.image(116, 'Egg')
    this.button(224, 'New Egg', () => this.show('new'), 20, 280, true, 38)
    this.button(268, 'Continue Adventure', () => this.show(this.state.active ? 'session' : 'existing'), 20, 280, false, 38)
    this.button(312, 'Dex', () => this.show('dex'), 20, 280, false, 38)
    this.text(354, '5 / 10 / 15 km   |   Mega at 21 km', 14, muted, 22)
  },

  show(view) { this.view = view; this.index = 0; this.megaIndex = 0; this.render() },

  render() {
    this.stopMotion()
    this.widgets.forEach((item) => deleteWidget(item))
    this.widgets = []
    this.stats = null
    this.clockStats = null
    this.portrait = null
    if (this.view === 'home') { this.renderHub(); return }
    if (this.view === 'new') { this.renderGenerationPicker(); return }
    this.background()
    if (this.view === 'dex-detail') {
      const name = this.dexName
      const key = (this.dexShiny ? 'Shiny ' : '') + name
      const record = this.state.dex[key]
      this.updateBackground(name)
      this.text(70, name, name.length > 23 ? 17 : 21, ink, 28)
      this.button(104, this.dexShiny ? 'Normal' : '> Normal', () => { this.dexShiny = false; this.render() }, 20, 134, !this.dexShiny)
      this.button(104, this.dexShiny ? '> Shiny' : 'Shiny', () => { this.dexShiny = true; this.render() }, 166, 134, this.dexShiny)
      if (record) {
        this.image(152, name, this.dexShiny)
        this.text(248, km(record.meters), 25)
        this.text(280, record.steps + ' steps', 18, muted, 24)
        this.text(306, record.finishedAt.slice(0, 10), 16, muted, 22)
      } else this.text(200, 'Not acquired', 23, muted)
      this.button(332, 'Back', () => { this.view = 'dex'; this.render() })
      return
    }
    if (this.view === 'session') {
      this.portrait = this.image(92, currentForm(this.state.active.route, this.state.active.meters, this.state.active.mega), this.state.active.shiny, null, 176)
      this.stats = [this.text(68, '', 18, ink, 24), this.text(272, '', 22, ink, 26),
        this.text(320, '', 12, muted, 16, 18, 94), this.text(320, '', 12, muted, 16, 112, 190)]
      this.clockStats = [this.text(298, '', 16, ink, 22, 18, 140), this.text(298, '', 16, ink, 22, 162, 140)]
      this.refreshStats()
      this.button(338, 'Finish & save', () => { this.sync(); this.show('finish') }, 20, 280, true, 40)
      return
    }
    if (this.view === 'finish') {
      this.text(70, 'Save this adventure?', 22, ink, 28)
      this.text(142, km(this.state.active.meters), 32, ink, 44)
      this.text(202, "Replaces this route's last record", 17, muted, 48)
      this.button(278, 'Save & finish', () => {
        this.sync()
        finishSession(this.state, new Date().toISOString())
        this.save()
        setWakeUpRelaunch({ relaunch: false })
        this.show('home')
      }, 20, 280, true)
      this.button(332, 'Keep walking', () => this.show('session'))
      return
    }
    const isDex = this.view === 'dex'
    const items = isDex ? dexPokemon(this.state.dex) : routes.map((_, i) => i)
      .filter((i) => this.view !== 'existing' || this.state.records[i])
      .filter((i) => this.view !== 'choose' || (this.selectedGeneration === 5 ? generation(i) > 4 : generation(i) === this.selectedGeneration))
    if (!items.length) {
      this.text(134, isDex ? 'No Pokemon acquired yet' : 'No saved adventures yet', 20, ink, 56)
      this.text(206, 'Choose a new egg to begin', 18, muted)
      this.button(332, 'Back', () => this.show('home'))
      return
    }
    const item = items[this.index]
    this.text(70, (isDex ? 'POKEDEX' : 'CHOOSE EGG') + ' ' + (this.index + 1) + '/' + items.length, 18, muted, 28)
    if (isDex) {
      this.updateBackground(item)
      this.button(108, item, () => this.openDex(item))
      this.image(156, item, !this.state.dex[item], () => this.openDex(item))
      this.text(256, 'Normal: ' + (this.state.dex[item] ? 'acquired' : 'locked'), 18, ink, 26)
      this.text(284, 'Shiny: ' + (this.state.dex['Shiny ' + item] ? 'acquired' : 'locked'), 18, ink, 26)
    } else {
      this.updateBackground(routes[item][0])
      this.text(104, routes[item][0] + ' egg', 22)
      this.image(136, routes[item][0])
      this.text(236, routes[item].join(' > '), 15, muted, 40)
      const choices = megaChoices(item)
      if (choices.length) this.button(280, choices[this.megaIndex % choices.length] + ' @21km', () => {
        this.megaIndex = (this.megaIndex + 1) % choices.length
        this.render()
      })
      else this.text(286, this.state.records[item] ? 'Last: ' + km(this.state.records[item].meters) : 'No Mega form', 17, muted)
    }
    const move = (delta) => { this.index = (this.index + delta + items.length) % items.length; this.megaIndex = 0; this.render() }
    this.button(332, '<', () => move(-1), 20, 44)
    this.button(332, '>', () => move(1), 68, 44)
    this.button(332, '+10', () => move(10), 116, 56)
    if (!isDex) this.button(332, 'Start', () => this.start(item), 176, 60, true)
    this.button(332, 'Back', () => this.show(this.view === 'choose' ? 'new' : 'home'), 240, 60)
  },

  start(route) {
    this.state.active = {
      route, startedAt: Date.now(), shiny: rollShiny(), mega: megaChoices(route)[this.megaIndex], meters: 0, steps: 0, day: dayKey(),
      lastMeters: this.distance.getCurrent(), lastSteps: this.step.getCurrent()
    }
    this.save()
    setWakeUpRelaunch({ relaunch: true })
    this.show('session')
  },

  refreshStats() {
    const session = this.state.active
    const form = currentForm(session.route, session.meters, session.mega)
    const next = nextMilestone(session.route, session.meters)
    const values = [(session.shiny ? 'Shiny ' : '') + (form === 'Egg' ? routes[session.route][0] + ' egg' : form),
      'Distance ' + km(session.meters), session.steps + ' steps',
      next === null ? 'Final form reached!' : km(next - session.meters) + ' to ' + (next === 21000 ? 'Mega' : form === 'Egg' ? 'hatch' : 'evolve')]
    this.stats.forEach((item, i) => item.setProperty(prop.TEXT, values[i]))
    this.stats[0].setProperty(prop.MORE, { text_size: values[0].length > 30 ? 14 : 18 })
    if (this.portrait) this.portrait.setProperty(prop.MORE, { src: spritePath(form, session.shiny) })
    this.updateBackground(form === 'Egg' ? routes[session.route][0] : form)
    this.refreshClock()
  },

  refreshClock() {
    const session = this.state.active
    const seconds = elapsedSeconds(session)
    this.clockStats[0].setProperty(prop.TEXT, 'Time ' + elapsedLabel(seconds))
    this.clockStats[1].setProperty(prop.TEXT, 'Pace ' + paceLabel(seconds, session.meters))
  },

  onDestroy() {
    this.stopMotion()
    if (this.ready) this.sync()
    if (this.distance && this.changed) this.distance.offChange(this.changed)
    if (this.step && this.changed) this.step.offChange(this.changed)
  }
})
