import { createWidget, deleteWidget, widget, align, prop, text_style, event } from '@zos/ui'
import { Distance, Step } from '@zos/sensor'
import { LocalStorage } from '@zos/storage'
import { setWakeUpRelaunch } from '@zos/display'
import { back } from '@zos/router'
import { createSprite, drawSprite } from './sprite'
import { legendarySpecies, ensureExpedition, expeditionGoal, clueMilestones } from '../shared/expedition'
import { routes, speciesCount, generation, megaChoices, rollShiny, collectionCount, primaryType, spritePath, nextMilestone, currentForm, elapsedSeconds, elapsedLabel, currentPace, updateSession, finishSession, refreshPersonalBests, repairDexRecords } from './pokemon'

const ink = 0xFFFFFF
const muted = 0x8CD3F5
const panelFill = 0x062138
const edge = 0x43B5EC
const selectedFill = 0x0C97C5
// Rectangular watches draw their own app-name/time header in the top 64 pixels.
const contentTop = 64
const historyTitles = { distance: 'Highest distance', elapsed: 'Longest elapsed time', hatch: 'Fastest 5 km hatch' }
const letterGroups = ['A-F', 'G-L', 'M-R', 'S-Z']
const eggLabels = routes.map(route => route.length > 1 ? route[0] + ' > ' + route[route.length - 1] : route[0])
const eggRoutes = routes.map((_, i) => i).filter(i => !legendarySpecies.includes(routes[i][0]))
// Sort display indices only: stored journeys keep their original catalog route IDs.
const eggOrder = eggRoutes.slice().sort((a, b) => eggLabels[a] < eggLabels[b] ? -1 : eggLabels[a] > eggLabels[b] ? 1 : a - b)
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
      this.requestedView = options && ['home', 'new', 'history'].includes(options.view) ? options.view : null
    } catch (_) { this.requestedView = null }
  },
  build() {
    this.widgets = []
    this.stats = null
    this.ready = false
    this.distance = null
    this.step = null
    this.changed = null
    this.pace = { awaitingChange: true }
    this.paceText = '--:-- /km'
    let stage = 'storage'
    try {
      this.storage = new LocalStorage()
      this.state = this.storage.getItem('zepimon-v1') || { dex: {}, records: {}, active: null }
      if (!this.state.dex || !this.state.records) throw new Error('Invalid saved data')
      ensureExpedition(this.state)
      refreshPersonalBests(this.state)
      repairDexRecords(this.state)
      this.save()
      this.view = this.requestedView === 'history' ? this.requestedView : this.state.active ? 'session' : this.requestedView || 'home'
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

  syncPhone() {
    try { getApp()._options.syncToPhone() }
    catch (error) { console.log('Zepimon phone sync unavailable:', String(error)) }
  },

  sync() {
    const session = this.state.active
    if (!session) return
    const meters = this.distance.getCurrent()
    const steps = this.step.getCurrent()
    const day = dayKey()
    const changed = meters !== session.lastMeters || steps !== session.lastSteps || session.day !== day
    const now = Date.now()
    if (!this.ready || session.day !== day || meters < session.lastMeters || steps < session.lastSteps) this.pace = { awaitingChange: true }
    updateSession(session, meters, steps, day, now)
    this.paceText = currentPace(this.pace, session.meters, now, session.activity, session.steps)
    if (changed) this.save()
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
    const item = createWidget(widget.BUTTON, {
      x: x + 3, y: y + 3, w: w - 6, h: h - 6, radius: 0, text,
      text_size: text.length > 23 ? 16 : 19, color: ink,
      normal_color: selected ? selectedFill : 0x095CA5, press_color: 0x073F75, click_func: action
    })
    this.widgets.push(item)
    return item
  },

  image(y, name, shiny = false, onClick, size = 96) {
    const x = (320 - size) / 2
    const item = createSprite(x, y, size, name, shiny)
    this.widgets.push(item)
    if (onClick) item.addEventListener(event.CLICK_UP, onClick)
    if (this.view === 'session' && this.motionTimer === undefined) {
      this.motionTimer = setInterval(() => {
        if (this.view === 'session' && this.clockStats) {
          const now = Date.now()
          if (this.ready && (!Number.isFinite(this.pace.checkedAt) || now < this.pace.checkedAt || now - this.pace.checkedAt >= 1000)) this.sync()
          else this.refreshClock()
          this.refreshSprite()
        }

      }, 200)
    }
    return item
  },

  stopMotion() {
    if (this.motionTimer !== undefined) clearInterval(this.motionTimer)
    this.motionTimer = undefined
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


  renderGenerationPicker() {
    this.rect(0, contentTop, 320, 380 - contentTop, 0x031A2C)
    this.panel(14, 68, 292, 42)
    this.text(74, 'Choose a generation', 21, 0xF2E4B5, 30)
    for (let gen = 1; gen <= 6; gen++) {
      const y = 116 + (gen - 1) * 43
      const selected = gen <= 5 && this.selectedGeneration === gen
      const title = gen === 6 ? 'Back to title' : gen <= 4 ? 'Generation ' + gen : 'Extra Mega families'
      this.button(y, title, () => {
        if (gen === 6) { back(); return }
        this.selectedGeneration = gen
        this.show('letters')
      }, 24, 272, selected, 38)
      if (selected) {
        this.rect(36, y + 10, 4, 18, 0xF4EAC7)
        this.rect(40, y + 13, 4, 12, 0xF4EAC7)
        this.rect(44, y + 16, 4, 6, 0xF4EAC7)
      }
    }
  },

  renderLetterPicker() {
    this.background()
    this.text(70, 'Choose letters', 22, ink, 28)
    this.text(104, this.selectedGeneration === 5 ? 'Extra Mega families' : 'Generation ' + this.selectedGeneration, 17, muted, 24)
    letterGroups.forEach((group, i) => this.button(136 + i * 46, group, () => {
      this.letterGroup = group
      this.listItems = eggOrder.filter(route => {
        const first = routes[route][0][0].toUpperCase()
        return first >= group[0] && first <= group[2] &&
          (this.selectedGeneration === 5 ? generation(route) > 4 : generation(route) === this.selectedGeneration)
      })
      this.listPage = 0
      this.show('choose')
    }, 20, 280, false, 40))
    this.button(332, 'Back', () => this.show('new'))
  },

  renderEggList() {
    this.background()
    this.text(70, (this.selectedGeneration === 5 ? 'Extra Mega' : 'Gen ' + this.selectedGeneration) + ' / ' + this.letterGroup, 22, ink, 28)
    if (!this.listItems.length) {
      this.text(160, 'No eggs in this group', 20, muted, 56)
      this.button(332, 'Back', () => this.show('letters'))
      return
    }
    this.listCounter = this.text(104, '', 16, muted, 24)
    this.listRows = []
    for (let row = 0; row < 4; row++) {
      this.listRows.push(this.button(136 + row * 46, '', () => {
        const route = this.listItems[this.listPage * 4 + row]
        if (route !== undefined) this.show('preview', route)
      }, 20, 280, false, 40))
    }
    const move = delta => {
      const next = this.listPage + delta
      if (next < 0 || next * 4 >= this.listItems.length) return
      this.listPage = next
      this.refreshEggList()
    }
    this.button(332, '< Prev', () => move(-1), 20, 84)
    this.button(332, 'Back', () => this.show('letters'), 108, 104)
    this.button(332, 'Next >', () => move(1), 216, 84)
    this.refreshEggList()
  },

  refreshEggList() {
    this.listCounter.setProperty(prop.TEXT, 'Page ' + (this.listPage + 1) + ' / ' + Math.ceil(this.listItems.length / 4))
    this.listRows.forEach((row, i) => {
      const route = this.listItems[this.listPage * 4 + i]
      const label = route === undefined ? '' : eggLabels[route]
      // BUTTON updates require geometry on this watch API; retain the existing widgets.
      row.setProperty(prop.MORE, { x: 23, y: 139 + i * 46, w: 274, h: 34,
        text: label, text_size: label.length > 23 ? 16 : 19 })
    })
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
    this.button(268, 'Random Egg', () => this.show('random', eggRoutes[Math.floor(Math.random() * eggRoutes.length)]), 20, 280, false, 38)
    this.button(312, 'Back', () => back(), 20, 280, false, 38)
    const expedition = this.state.expedition
    this.text(354, 'Expedition: ' + km(expedition.meters % expeditionGoal) + ' / 25', 13, muted, 22)
  },

  show(view, index = 0) { this.view = view; this.index = index; this.megaIndex = 0; this.render() },

  renderHistory() {
    this.background()
    this.text(70, 'History', 24, ink, 30)
    this.text(104, 'Pokemon personal bests', 16, muted, 22)
    Object.keys(historyTitles).forEach((metric, i) => {
      this.button(136 + i * 60, historyTitles[metric], () => {
        this.historyMetric = metric
        this.show('history-detail')
      }, 20, 280, i === 0, 50)
    })
    this.button(332, 'Back', () => back())
  },

  renderHistoryDetail() {
    const metric = this.historyMetric
    const record = this.state.personalBests[metric]
    this.background()
    this.text(70, historyTitles[metric], 20, ink, 26)
    if (record) {
      const form = metric === 'hatch' ? routes[record.route][0] : record.form || currentForm(record.route, record.meters, record.mega)
      const name = (record.shiny ? 'Shiny ' : '') + (form === 'Egg' ? routes[record.route][0] + ' egg' : form)
      this.updateBackground(form === 'Egg' ? routes[record.route][0] : form)
      this.text(100, name, name.length > 23 ? 15 : 20, ink, 24)
      this.image(130, form, record.shiny, null, 144)
      this.text(276, metric === 'distance' ? km(record.meters) : elapsedLabel(metric === 'hatch' ? record.hatchSeconds : record.elapsedSeconds), 25, ink, 30)
      this.text(308, metric === 'hatch' ? '5 km hatch (first detected)' :
        (metric === 'elapsed' ? 'Includes stops | ' : 'Saved ') + record.finishedAt.slice(0, 10), 12, muted, 18)
    } else {
      this.text(160, 'No record yet', 23, ink, 32)
      this.text(206, metric === 'hatch' ? 'Reach 5 km, then save a new adventure.' :
        metric === 'elapsed' ? 'Finish & save a new timed adventure.' : 'Finish & save an adventure.', 18, muted, 64)
    }
    this.button(332, 'Back', () => this.show('history'))
  },

  render() {
    this.stopMotion()
    this.widgets.forEach((item) => deleteWidget(item))
    this.widgets = []
    this.stats = null
    this.clockStats = null
    this.portrait = null
    this.portraitKey = null
    this.listRows = null
    this.listCounter = null
    if (this.view === 'history') { this.renderHistory(); return }
    if (this.view === 'history-detail') { this.renderHistoryDetail(); return }
    if (this.view === 'home') { this.renderHub(); return }
    if (this.view === 'new') { this.renderGenerationPicker(); return }
    if (this.view === 'expedition-saved') {
      this.background()
      this.text(70, 'Adventure saved!', 22, ink, 28)
      this.text(132, this.expeditionNotice, 22, 0xF2E4B5, 70)
      this.text(218, 'Sync to Zepimon on your phone to follow the clues.', 18, muted, 80)
      this.button(332, 'Done', () => this.show('home'))
      return
    }
    if (this.view === 'letters') { this.renderLetterPicker(); return }
    if (this.view === 'choose') { this.renderEggList(); return }
    this.background()
    if (this.view === 'activity') {
      this.updateBackground(routes[this.pendingRoute][0])
      this.text(70, 'Choose your activity', 22, ink, 28)
      this.text(110, routes[this.pendingRoute][0] + ' egg', 20, muted, 28)
      this.image(142, 'Egg')
      this.button(242, 'Walking', () => this.start(this.pendingRoute, 'walking'), 20, 280, true, 38)
      this.button(286, 'Running', () => this.start(this.pendingRoute, 'running'), 20, 280, false, 38)
      this.button(332, 'Back', () => { this.view = this.eggView; this.render() })
      return
    }
    if (this.view === 'session') {
      this.portrait = this.image(92, currentForm(this.state.active.route, this.state.active.meters, this.state.active.mega), this.state.active.shiny, null, 176)
      this.stats = [this.text(68, '', 18, ink, 24), this.text(272, '', 22, ink, 26),
        this.text(320, '', 11, muted, 16, 18, 112), this.text(320, '', 12, muted, 16, 130, 172)]
      this.clockStats = [this.text(298, '', 16, ink, 22, 18, 140), this.text(298, '', 14, ink, 22, 162, 140)]
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
        const before = this.state.expedition.meters
        finishSession(this.state, new Date().toISOString())
        this.save()
        this.syncPhone()
        setWakeUpRelaunch({ relaunch: false })
        const after = this.state.expedition.meters
        const encounters = Math.floor(after / expeditionGoal) - Math.floor(before / expeditionGoal)
        const crossed = clueMilestones.some(m => before % expeditionGoal < m && after % expeditionGoal >= m)
        this.expeditionNotice = encounters > 0 ? 'Legendary encounter ready!' : 'A mysterious clue appeared!'
        this.show(encounters > 0 || crossed ? 'expedition-saved' : 'home')
      }, 20, 280, true)
      this.button(332, this.state.active.activity === 'running' ? 'Keep running' : 'Keep walking', () => this.show('session'))
      return
    }
    const item = this.index
    this.text(70, this.view === 'random' ? 'RANDOM EGG' : 'EGG PREVIEW', 18, muted, 28)
    this.updateBackground(routes[item][0])
    this.text(104, routes[item][0] + ' egg', 22)
    this.image(136, routes[item][0])
    this.text(236, routes[item].join(' > '), 15, muted, 40)
    const choices = megaChoices(item)
    if (choices.length) {
      const megaButton = this.button(280, choices[this.megaIndex % choices.length] + ' @21km', () => {
        this.megaIndex = (this.megaIndex + 1) % choices.length
        const label = choices[this.megaIndex] + ' @21km'
        megaButton.setProperty(prop.MORE, { x: 23, y: 283, w: 274, h: 36,
          text: label, text_size: label.length > 23 ? 16 : 19 })
      })
    } else this.text(286, this.state.records[item] ? 'Last: ' + km(this.state.records[item].meters) : 'No Mega form', 17, muted)
    this.button(332, 'Start', () => {
      this.pendingRoute = item
      this.eggView = this.view
      this.view = 'activity'
      this.render()
    }, 20, 136, true)
    this.button(332, 'Back', () => this.show(this.view === 'preview' ? 'choose' : 'home'), 164, 136)
  },

  start(route, activity = 'walking') {
    if (this.state.active) { this.show('session'); return }
    this.pace = {}
    this.paceText = '--:-- /km'
    this.state.active = {
      route, activity, startedAt: Date.now(), shiny: rollShiny(), mega: megaChoices(route)[this.megaIndex], meters: 0, steps: 0, day: dayKey(),
      lastMeters: this.distance.getCurrent(), lastSteps: this.step.getCurrent()
    }
    this.save()
    setWakeUpRelaunch({ relaunch: true })
    this.syncPhone()
    this.show('session')
  },

  refreshStats() {
    const session = this.state.active
    const form = currentForm(session.route, session.meters, session.mega)
    const next = nextMilestone(session.route, session.meters)
    const values = [(session.shiny ? 'Shiny ' : '') + (form === 'Egg' ? routes[session.route][0] + ' egg' : form),
      'Distance ' + km(session.meters), (session.activity === 'running' ? 'Run: ' : 'Walk: ') + session.steps + ' steps',
      next === null ? 'Final form reached!' : km(next - session.meters) + ' to ' + (next === 21000 ? 'Mega' : form === 'Egg' ? 'hatch' : 'evolve')]
    this.stats.forEach((item, i) => item.setProperty(prop.TEXT, values[i]))
    this.stats[0].setProperty(prop.MORE, { text_size: values[0].length > 30 ? 14 : 18 })
    this.refreshSprite()
    this.updateBackground(form === 'Egg' ? routes[session.route][0] : form)
    this.refreshClock()
  },

  refreshClock() {
    const session = this.state.active
    const seconds = elapsedSeconds(session)
    this.clockStats[0].setProperty(prop.TEXT, 'Time ' + elapsedLabel(seconds))
    this.clockStats[1].setProperty(prop.TEXT, 'Est. pace ' + this.paceText)
  },

  refreshSprite() {
    if (!this.portrait || !this.state.active) return
    const session = this.state.active
    const form = currentForm(session.route, session.meters, session.mega)
    const frame = Math.floor(Date.now() / (session.activity === 'running' ? 200 : 400)) % 2
    const key = form + ':' + session.shiny + ':' + frame
    if (this.portraitKey === key) return
    drawSprite(this.portrait, form, session.shiny, 176, frame)
    this.portraitKey = key
  },

  onDestroy() {
    this.stopMotion()
    if (this.ready) this.sync()
    if (this.distance && this.changed) this.distance.offChange(this.changed)
    if (this.step && this.changed) this.step.offChange(this.changed)
  }
})
