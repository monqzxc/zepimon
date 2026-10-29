import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// preferences.ts reads AsyncStorage as it loads, so it runs here with stand-ins for its React Native imports.
const modules = {
  '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: () => Promise.resolve(null), setItem: () => Promise.resolve() } },
  react: { useSyncExternalStore: () => {} },
  './palettes.ts': { themeNames: ['emerald', 'gengar', 'deoxys', 'pikachu'] }
}
const context = { exports: {}, require: name => modules[name] }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/preferences.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, context)
const prefs = context.exports

test('Safari controls default to the D-pad and Brendan, and keep valid choices', () => {
  const pick = ({ safariControls, safariTrainer }) => ({ safariControls, safariTrainer })
  assert.deepEqual(pick(prefs.defaultPreferences), { safariControls: 'dpad', safariTrainer: 'brendan' })
  assert.deepEqual(pick(prefs.restorePreferences({})), { safariControls: 'dpad', safariTrainer: 'brendan' })
  assert.deepEqual(pick(prefs.restorePreferences({ safariControls: 'tap', safariTrainer: 'may' })), { safariControls: 'tap', safariTrainer: 'may' })
  assert.deepEqual(pick(prefs.restorePreferences({ safariControls: 'joystick', safariTrainer: 7 })), { safariControls: 'dpad', safariTrainer: 'brendan' })
  assert.equal(prefs.restorePreferences({ theme: 'deoxys', safariControls: 'tap' }).theme, 'deoxys')
})

test('immersive play opens in portrait until landscape is chosen, and keeps the choice', () => {
  assert.equal(prefs.defaultPreferences.playOrientation, 'portrait')
  assert.equal(prefs.restorePreferences({}).playOrientation, 'portrait')
  assert.equal(prefs.restorePreferences({ playOrientation: 'landscape' }).playOrientation, 'landscape')
  assert.equal(prefs.restorePreferences({ playOrientation: 'sideways' }).playOrientation, 'portrait')
  assert.equal(prefs.restorePreferences({ playOrientation: 'landscape', safariControls: 'tap' }).safariControls, 'tap')
})

test('a fresh install opens in Emerald; every saved theme is kept', () => {
  assert.equal(prefs.defaultPreferences.theme, 'emerald')
  assert.equal(prefs.startingPreferences(null, false).theme, 'emerald', 'A new install with nothing saved')
  for (const theme of ['gengar', 'deoxys', 'pikachu', 'emerald']) {
    assert.equal(prefs.restorePreferences({ theme }).theme, theme)
    assert.equal(prefs.startingPreferences({ theme, appearance: 'dark' }, true).theme, theme)
  }
})

test('people who had the app before Emerald keep the Gengar look they were seeing', () => {
  // They never opened Theme, so nothing was saved, but their journal was: Gengar was the default they saw.
  assert.equal(prefs.startingPreferences(null, true).theme, 'gengar')
  assert.equal(JSON.stringify({ ...prefs.startingPreferences(null, true), theme: 'emerald' }), JSON.stringify(prefs.defaultPreferences), 'Everything else is the default')
  // Settings saved before themes existed, or a theme that no longer exists, also meant Gengar.
  assert.equal(prefs.restorePreferences({ motion: 'reduced' }).theme, 'gengar')
  assert.equal(prefs.restorePreferences({ theme: 'teal' }).theme, 'gengar')
  assert.equal(prefs.startingPreferences({ appearance: 'dark' }, false).theme, 'gengar', 'Any saved settings mean an earlier install')
})
