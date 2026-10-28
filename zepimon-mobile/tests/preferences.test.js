import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// preferences.ts reads AsyncStorage as it loads, so it runs here with stand-ins for its React Native imports.
const modules = {
  '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: () => Promise.resolve(null), setItem: () => Promise.resolve() } },
  react: { useSyncExternalStore: () => {} },
  './palettes.ts': { themeNames: ['gengar', 'deoxys', 'pikachu'] }
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
