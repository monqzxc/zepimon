import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve('zepimon-mobile')
const out = resolve('tmp/mobile-check')
mkdirSync(out, { recursive: true })
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=9232', `--user-data-dir=${out}/chrome-${Date.now()}`, 'about:blank'
], { windowsHide: true, stdio: 'ignore' })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let socket
try {
  let target
  for (let i = 0; i < 60; i++) {
    try { target = await (await fetch('http://127.0.0.1:9232/json/new?about:blank', { method: 'PUT' })).json(); break } catch { await pause(250) }
  }
  assert.ok(target, 'Chrome debugger started')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  let sequence = 0
  const pending = new Map()
  const errors = []
  let fileChooser
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails)
    if (message.method === 'Page.fileChooserOpened') fileChooser = message.params
    if (message.id) {
      const waiting = pending.get(message.id)
      pending.delete(message.id)
      message.error ? waiting?.reject(message.error) : waiting?.resolve(message.result)
    }
  })
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result?.value
  }
  const waitFor = async expression => {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await pause(100) }
    throw new Error('Timed out: ' + expression + '\n' + await evaluate('document.body.innerText'))
  }
  const body = () => evaluate('document.body.innerText')
  const visible = `e => e.getClientRects().length > 0`
  const click = async title => {
    const selector = `[...document.querySelectorAll('[role="button"]')].filter(${visible}).find(e=>e.innerText.trim()===${JSON.stringify(title)})`
    await waitFor(`!!(${selector})`)
    await evaluate(`(${selector}).click()`); await pause(100)
  }
  const tab = async title => {
    await evaluate(`([...document.querySelectorAll('[role="tab"]')].find(e=>e.innerText.trim().endsWith(${JSON.stringify(title)}))).click()`)
    await pause(250)
  }
  const input = async (label, value) => {
    await evaluate(`(()=>{ const e=document.querySelector('[aria-label="${label}"]');
      Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});
      e.dispatchEvent(new Event('input',{bubbles:true})); })()`)
    await pause(100)
  }
  const screenshot = async name => {
    await pause(250)
    const result = await call('Page.captureScreenshot', { format: 'png' })
    writeFileSync(resolve(out, name + '.png'), Buffer.from(result.data, 'base64'))
  }
  await call('Runtime.enable'); await call('Page.enable')
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await call('Page.navigate', { url: 'http://127.0.0.1:8091/' })
  await waitFor(`document.body.innerText.includes('A fresh page')`)
  await screenshot('welcome')
  await tab('Missions')
  await waitFor(`document.body.innerText.includes('Hidden achievement')`)
  assert.ok(!(await body()).includes('Dawn patrol'), 'Hidden badge title is concealed before unlock')
  await tab('Import')
  await input('Paste Zepimon export JSON', '{bad')
  await click('Check pasted JSON')
  assert.ok((await body()).includes('not valid JSON'))
  const demo = readFileSync(resolve(root, 'examples/demo-export.json'), 'utf8')
  await input('Paste Zepimon export JSON', demo)
  await click('Check pasted JSON')
  await click('Use this export')
  await waitFor(`document.body.innerText.includes('Journal imported.')`)
  const stored = () => evaluate(`JSON.parse(localStorage.getItem('zepimon-mobile-v1'))`)
  assert.equal((await stored()).progress.runs.length, 4)
  const badges = JSON.stringify((await stored()).progress.unlocked)
  await input('Paste Zepimon export JSON', demo)
  await click('Check pasted JSON'); await click('Use this export')
  await waitFor(`document.body.innerText.includes('Journal imported.')`)
  assert.equal((await stored()).progress.runs.length, 4)
  assert.equal(JSON.stringify((await stored()).progress.unlocked), badges)
  const older = JSON.parse(demo); older.snapshot.capturedAt--
  await input('Paste Zepimon export JSON', JSON.stringify(older)); await click('Check pasted JSON')
  assert.ok((await body()).includes('older than'))
  await call('Page.setInterceptFileChooserDialog', { enabled: true })
  await click('Choose JSON file')
  for (let i = 0; !fileChooser && i < 100; i++) await pause(50)
  assert.ok(fileChooser, 'File picker opens')
  await call('DOM.setFileInputFiles', { files: [resolve(root, 'examples/demo-export.json')], backendNodeId: fileChooser.backendNodeId })
  await click('Use this export')
  await waitFor(`document.body.innerText.includes('Journal imported.')`)
  assert.equal((await stored()).progress.runs.length, 4)
  await call('Page.setInterceptFileChooserDialog', { enabled: false })
  await tab('Dex')
  await waitFor(`document.body.innerText.includes('The field Dex')`)
  await screenshot('dex')
  await input('Search Pokemon or type', 'Bulbasaur')
  await evaluate(`document.querySelector('[aria-label="View Bulbasaur record"]').click()`)
  await waitFor(`document.body.innerText.includes('Choose Shiny buddy')`)
  assert.ok((await body()).includes('6.00 km')); assert.ok((await body()).includes('5.50 km'))
  await click('Choose Shiny buddy')
  await waitFor(`document.body.innerText.includes('Buddy saved')`)
  assert.equal((await stored()).buddy, 'Shiny Bulbasaur')
  await screenshot('pokemon')
  await evaluate('history.back()'); await pause(300)
  await tab('Missions'); await screenshot('missions')
  assert.ok((await body()).includes('Two of a kind'))
  await tab('Journal'); await screenshot('journal')
  assert.ok((await body()).includes('44.50 km'))
  await call('Page.reload')
  await waitFor(`document.body.innerText.includes('Shiny Bulbasaur')`)
  assert.equal((await stored()).progress.runs.length, 4)
  assert.equal(JSON.stringify((await stored()).progress.unlocked), badges)
  await tab('Play'); await click('Play Memory Match'); await screenshot('play')
  const memories = new Map()
  for (let turn = 0; turn < 45; turn++) {
    if ((await body()).includes('pairs found in')) break
    const labels = await evaluate(`([...document.querySelectorAll('[aria-label^="Card "]')].filter(${visible})).map(e=>e.getAttribute('aria-label'))`)
    const hidden = labels.filter(label => label.endsWith('face down')).map(label => label.split(',')[0])
    assert.ok(hidden.length > 0)
    const knownPairs = hidden.filter(a => memories.has(a) && hidden.some(b => b!==a && memories.get(b) === memories.get(a)))
    const first = knownPairs[0] || hidden.find(a=>!memories.has(a)) || hidden[0]
    await evaluate(`document.querySelector('[aria-label="${first}, face down"]').click()`); await pause(80)
    const face = await evaluate(`document.querySelector('[aria-label^="${first},"]').getAttribute('aria-label')`)
    const species = face.split(', ')[1]
    memories.set(first, species)
    const second = hidden.find(a=>a!==first && memories.get(a)===species) || hidden.find(a=>a!==first && !memories.has(a)) || hidden.find(a=>a!==first)
    await evaluate(`document.querySelector('[aria-label="${second}, face down"]').click()`); await pause(80)
    const secondFace = await evaluate(`document.querySelector('[aria-label^="${second},"]').getAttribute('aria-label')`)
    memories.set(second, secondFace.split(', ')[1])
    await pause(850)
  }
  assert.ok((await body()).includes('pairs found in'), 'Memory Match can finish')
  assert.ok((await stored()).bestMoves[6] >= 6, 'Best score persisted')
  await screenshot('play-complete')
  await tab('Dex'); await input('Search Pokemon or type', '')
  await call('Emulation.setDeviceMetricsOverride', { width: 320, height: 700, deviceScaleFactor: 1, mobile: true })
  await screenshot('dex-small')
  assert.ok(await evaluate('document.documentElement.scrollWidth <= 320'), 'No horizontal viewport overflow on a small phone')
  assert.ok(await evaluate(`[...document.querySelectorAll('[role="tab"]')].every(e=>e.lastElementChild.getBoundingClientRect().bottom <= innerHeight)`), 'Tab labels fit inside the phone viewport')
  assert.deepEqual(errors, [], 'No JavaScript runtime errors')
  console.log('PASS: empty state, hidden badges, invalid/valid/repeated/older imports, file picker, Dex variants, buddy, retained history, reload persistence, complete Memory Match, and 320px layout. Screenshots: tmp/mobile-check')
} finally {
  socket?.close()
  chrome.kill()
}
