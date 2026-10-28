import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// DPad.tsx runs here as on the web, with a fake window that records its listeners and stand-ins for React Native.
const listeners = {}
const fakeWindow = {
  addEventListener: (type, fn) => { listeners[type] = fn },
  removeEventListener: type => { delete listeners[type] }
}
const modules = {
  react: { useEffect: effect => effect(), useRef: value => ({ current: value }) },
  'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
  'react-native': { Platform: { OS: 'web' }, Pressable: 'Pressable', Text: 'Text', View: 'View' },
  '../ui': { colors: {}, fonts: {}, themedStyles: () => ({}) }
}
const context = { exports: {}, require: name => modules[name], window: fakeWindow }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/games/DPad.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }
}).outputText, context)
const { keyDirection, useKeyboardDirections } = context.exports
const key = (key, extra = {}) => ({ key, repeat: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault() { this.prevented = true }, ...extra })

test('arrow keys and WASD walk, but not with Ctrl, Cmd or Alt held (browser shortcuts stay theirs)', () => {
  assert.equal(keyDirection(key('ArrowUp')), 'north')
  assert.equal(keyDirection(key('a')), 'west')
  assert.equal(keyDirection(key('D')), 'east')
  assert.equal(keyDirection(key('x')), null)
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) assert.equal(keyDirection(key('s', { [modifier]: true })), null, modifier)
})

test('a shortcut is left alone, a held key repeats nothing, and leaving the window lets go of everything', () => {
  const pressed = [], lost = []
  useKeyboardDirections(direction => pressed.push(direction), () => {}, true, () => lost.push('lost'))
  const shortcut = key('s', { ctrlKey: true })
  listeners.keydown(shortcut)
  assert.deepEqual(pressed, [])
  assert.equal(shortcut.prevented, undefined, 'Ctrl+S still saves the page')
  listeners.keydown(key('ArrowDown'))
  listeners.keydown(key('ArrowDown', { repeat: true }))
  assert.deepEqual(pressed, ['south'])
  listeners.blur()
  assert.deepEqual(lost, ['lost'], 'Alt-tabbing away with a key held never sends its keyup')
})
