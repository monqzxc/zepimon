import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { resolve } from 'node:path'
import ts from 'typescript'

test('offline front-facing assets contain paired normal/shiny frames and no watch paths', () => {
  const files = []
  const manifest = vm.runInNewContext(fs.readFileSync('src/generated/walking.js', 'utf8').replace('export const', 'const') + '\nwalkingFrames', {
    require(path) { assert.ok(path.startsWith('../../assets/walking/')); files.push(path); return path }
  })
  assert.equal(Object.keys(manifest).length, 1200)
  for (const name of Object.keys(manifest).filter(name => !name.startsWith('Shiny '))) {
    assert.equal(manifest[name].length, 2)
    assert.equal(manifest['Shiny ' + name].length, 2)
  }
  for (const path of files) {
    const png = fs.readFileSync(resolve('src/generated', path))
    assert.equal(png.readUInt32BE(16), 44)
    assert.equal(png.readUInt32BE(20), 44)
  }
  assert.notDeepEqual(manifest.Gible.map(path => fs.readFileSync(resolve('src/generated', path)))[0],
    fs.readFileSync(resolve('src/generated', manifest.Gible[1])), 'Reactions must use distinct poses')
  assert.equal(manifest.Egg, undefined)
  assert.equal(manifest['Mega Baxcalibur'], undefined)
})

test('tap reactions finish, restart safely, pause on blur/background, and respect reduced motion', async () => {
  const states = []
  let stateIndex = 0, focus
  const listeners = new Map(), timers = new Map()
  let timerId = 0
  const jsx = (type, props) => ({ type, props })
  const modules = {
    react: { useCallback: fn => fn, useState(initial) {
      const i = stateIndex++
      if (!(i in states)) states[i] = initial
      return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value }]
    }, useRef(initial) {
      const i = stateIndex++
      if (!(i in states)) states[i] = { current: initial }
      return states[i]
    } },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { useFocusEffect: fn => { focus = fn } },
    'react-native': {
      Image: 'Image', Pressable: 'Pressable', Text: 'Text', Platform: { OS: 'android' },
      AppState: { currentState: 'active', addEventListener: (event, fn) => listen(event, fn) },
      AccessibilityInfo: { isReduceMotionEnabled: async () => false, addEventListener: (event, fn) => listen(event, fn) }
    },
    './catalog': { spriteSource: (name, shiny) => (shiny ? 'shiny-' : '') + name + '.png' },
    './generated/walking.js': { walkingFrames: { Gible: ['g0', 'g1'], 'Shiny Gible': ['s0', 's1'] } }
  }
  function listen(event, fn) { listeners.set(event, fn); return { remove: () => listeners.delete(event) } }
  const context = { exports: {}, require: name => modules[name],
    setInterval(fn) { const id = ++timerId; timers.set(id, fn); return id }, clearInterval: id => timers.delete(id) }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/Sprite.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, context)
  const render = (props = { name: 'Gible' }) => { stateIndex = 0; return context.exports.Sprite(props) }
  const source = tree => tree.props.children[0].props.source
  const heart = tree => !!tree.props.children[1]
  const tick = () => [...timers.values()].forEach(fn => fn())
  assert.equal(source(render()), 'g0')
  let cleanup = focus()
  await Promise.resolve()
  assert.equal(timers.size, 0, 'Idle Pokemon face the viewer without an endless timer')
  render().props.onPress()
  assert.equal(source(render()), 'g1')
  assert.equal(heart(render()), true)
  tick()
  assert.equal(source(render()), 'g0')
  for (let i = 0; i < 5; i++) tick()
  assert.equal(timers.size, 0)
  assert.equal(heart(render()), false)
  for (let i = 0; i < 10; i++) render().props.onPress()
  assert.equal(timers.size, 1, 'Rapid taps restart a single bounded reaction')
  listeners.get('change')('background')
  assert.equal(timers.size, 0)
  render().props.onPress()
  assert.equal(timers.size, 0, 'Background reactions cannot start')
  listeners.get('change')('active')
  listeners.get('reduceMotionChanged')(true)
  render().props.onPress()
  assert.equal(source(render()), 'g0')
  assert.equal(heart(render()), true, 'Reduced motion keeps a still heart response')
  for (let i = 0; i < 6; i++) tick()
  assert.equal(timers.size, 0)
  cleanup()
  assert.equal(listeners.size, 0)
  assert.equal(source(render({ name: 'Gible', shiny: true })), 's0')
  cleanup = focus(); await Promise.resolve()
  render({ name: 'Gible', shiny: true }).props.onPress()
  assert.equal(source(render({ name: 'Gible', shiny: true })), 's1')
  cleanup()
  assert.equal(timers.size, 0)
  render({ name: 'Gible', shiny: true }).props.children[0].props.onError()
  assert.equal(source(render({ name: 'Gible', shiny: true })), 'shiny-Gible.png')
  assert.equal(source(render({ name: 'Egg' })), 'Egg.png')
  cleanup = focus(); await Promise.resolve()
  render({ name: 'Egg' }).props.onPress()
  assert.equal(heart(render({ name: 'Egg' })), true)
  assert.equal(source(render({ name: 'Egg' })), 'Egg.png')
  cleanup()
})

test('every Legendary has Normal and Shiny four-direction overworld art, so the Legendary Gate, chamber and Resonance Trial show it', async () => {
  const { legendarySpecies } = await import('../src/generated/expedition.js')
  const keys = new Set([...fs.readFileSync('src/generated/trail-walkers.js', 'utf8').matchAll(/^  "([^"]+)": require\('\.\.\/\.\.\/assets\/trail\/([^']+)'\)/gm)]
    .map(([, name, file]) => { assert.ok(fs.existsSync(resolve('assets/trail', file)), file); return name }))
  for (const name of legendarySpecies) {
    assert.ok(keys.has(name), `${name} overworld strip`)
    assert.ok(keys.has(`Shiny ${name}`), `Shiny ${name} overworld strip`)
  }
})
